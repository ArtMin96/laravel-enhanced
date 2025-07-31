import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface ModelField {
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
    comment?: string;
}

interface ModelInfo {
    name: string;
    table: string;
    fields: ModelField[];
    relationships: RelationshipInfo[];
    filePath: string;
}

interface RelationshipInfo {
    name: string;
    type: string;
    relatedModel: string;
    foreignKey?: string;
    localKey?: string;
}

interface ViewInfo {
    name: string;
    path: string;
    variables: string[];
    extends?: string;
    sections: string[];
}

export class LaravelIntelligentCompletionProvider implements vscode.CompletionItemProvider {
    private models: Map<string, ModelInfo> = new Map();
    private views: Map<string, ViewInfo> = new Map();
    private migrations: Map<string, ModelField[]> = new Map();

    constructor(private workspaceRoot: string) {
        this.analyzeProject();
        this.setupWatchers();
    }

    private setupWatchers() {
        // Watch model files
        const modelWatcher = vscode.workspace.createFileSystemWatcher('**/app/Models/**/*.php');
        modelWatcher.onDidChange(() => this.analyzeModels());
        modelWatcher.onDidCreate(() => this.analyzeModels());
        modelWatcher.onDidDelete(() => this.analyzeModels());

        // Also watch for models in app/ directory (Laravel 7 and below)
        const appModelWatcher = vscode.workspace.createFileSystemWatcher('**/app/*.php');
        appModelWatcher.onDidChange(() => this.analyzeModels());
        appModelWatcher.onDidCreate(() => this.analyzeModels());
        appModelWatcher.onDidDelete(() => this.analyzeModels());

        // Watch migration files
        const migrationWatcher = vscode.workspace.createFileSystemWatcher('**/database/migrations/**/*.php');
        migrationWatcher.onDidChange(() => this.analyzeMigrations());
        migrationWatcher.onDidCreate(() => this.analyzeMigrations());
        migrationWatcher.onDidDelete(() => this.analyzeMigrations());

        // Watch view files
        const viewWatcher = vscode.workspace.createFileSystemWatcher('**/resources/views/**/*.blade.php');
        viewWatcher.onDidChange(() => this.analyzeViews());
        viewWatcher.onDidCreate(() => this.analyzeViews());
        viewWatcher.onDidDelete(() => this.analyzeViews());
    }

    private analyzeProject() {
        this.analyzeMigrations(); // Analyze migrations first
        this.analyzeModels();      // Then models (to merge with migration data)
        this.analyzeViews();
    }

    private analyzeModels() {
        this.models.clear();

        // Check both possible model locations
        const modelsPaths = [
            path.join(this.workspaceRoot, 'app', 'Models'),
            path.join(this.workspaceRoot, 'app') // Fallback for older Laravel versions
        ];

        for (const modelsPath of modelsPaths) {
            if (fs.existsSync(modelsPath)) {
                this.scanModelDirectory(modelsPath);
            }
        }

        console.log(`Found ${this.models.size} models:`, Array.from(this.models.keys()));
    }

    private scanModelDirectory(dir: string) {
        try {
            const files = fs.readdirSync(dir, { withFileTypes: true });

            files.forEach(file => {
                if (file.isDirectory()) {
                    this.scanModelDirectory(path.join(dir, file.name));
                } else if (file.name.endsWith('.php') && !file.name.includes('Controller')) {
                    const filePath = path.join(dir, file.name);
                    this.parseModelFile(filePath);
                }
            });
        } catch (error) {
            console.error(`Error scanning model directory ${dir}:`, error);
        }
    }

    private parseModelFile(filePath: string) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const modelName = path.basename(filePath, '.php');

            // More comprehensive check for model classes
            const isModel = content.includes('extends Model') ||
                content.includes('extends Authenticatable') ||
                content.includes('use HasFactory') ||
                content.includes('use Illuminate\\Database\\Eloquent\\Model') ||
                (content.includes('class ' + modelName) &&
                    (content.includes('$fillable') || content.includes('$table')));

            if (!isModel) {
                return;
            }

            console.log(`Parsing model: ${modelName}`);

            const model: ModelInfo = {
                name: modelName,
                table: this.extractTableName(content, modelName),
                fields: [],
                relationships: [],
                filePath
            };

            // Extract fillable fields
            const fillableMatch = content.match(/protected\s+\$fillable\s*=\s*\[([\s\S]*?)\]/);
            if (fillableMatch) {
                const fillableFields = this.extractArrayValues(fillableMatch[1]);
                fillableFields.forEach(field => {
                    if (field && field.trim()) {
                        model.fields.push({
                            name: field.trim(),
                            type: 'string', // Default type, will be refined by migration analysis
                            nullable: false
                        });
                    }
                });
            }

            // Extract hidden fields
            const hiddenMatch = content.match(/protected\s+\$hidden\s*=\s*\[([\s\S]*?)\]/);
            if (hiddenMatch) {
                const hiddenFields = this.extractArrayValues(hiddenMatch[1]);
                hiddenFields.forEach(field => {
                    if (field && field.trim()) {
                        const existingField = model.fields.find(f => f.name === field.trim());
                        if (!existingField) {
                            model.fields.push({
                                name: field.trim(),
                                type: 'string',
                                nullable: false
                            });
                        }
                    }
                });
            }

            // Extract casts
            const castsMatch = content.match(/protected\s+\$casts\s*=\s*\[([\s\S]*?)\]/);
            if (castsMatch) {
                const castEntries = this.extractCasts(castsMatch[1]);
                Object.entries(castEntries).forEach(([field, cast]) => {
                    if (field && cast) {
                        const existingField = model.fields.find(f => f.name === field);
                        if (existingField) {
                            existingField.type = this.castToType(cast);
                        } else {
                            model.fields.push({
                                name: field,
                                type: this.castToType(cast),
                                nullable: false
                            });
                        }
                    }
                });
            }

            // Extract relationships
            model.relationships = this.extractRelationships(content);

            // Merge with migration data if available
            const migrationFields = this.migrations.get(model.table);
            if (migrationFields) {
                migrationFields.forEach(migrationField => {
                    const existingField = model.fields.find(f => f.name === migrationField.name);
                    if (existingField) {
                        // Update with migration data
                        existingField.type = migrationField.type;
                        existingField.nullable = migrationField.nullable;
                        existingField.default = migrationField.default;
                    } else {
                        // Add field from migration
                        model.fields.push(migrationField);
                    }
                });
            }

            // Add default fields that are always present
            const defaultFields = [
                { name: 'id', type: 'integer' },
                { name: 'created_at', type: 'datetime' },
                { name: 'updated_at', type: 'datetime' }
            ];

            defaultFields.forEach(({ name, type }) => {
                if (!model.fields.find(f => f.name === name)) {
                    model.fields.push({
                        name,
                        type,
                        nullable: false
                    });
                }
            });

            this.models.set(modelName, model);
            console.log(`Model ${modelName} parsed with ${model.fields.length} fields`);
        } catch (error) {
            console.error(`Error parsing model file ${filePath}:`, error);
        }
    }

    private extractTableName(content: string, modelName: string): string {
        const tableMatch = content.match(/protected\s+\$table\s*=\s*['"`]([^'"`]+)['"`]/);
        if (tableMatch) {
            return tableMatch[1];
        }

        // Convert model name to snake_case table name
        return modelName
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .substring(1) + 's';
    }

    private extractArrayValues(arrayContent: string): string[] {
        const values: string[] = [];
        const regex = /['"`]([^'"`]+)['"`]/g;
        let match;

        while ((match = regex.exec(arrayContent)) !== null) {
            values.push(match[1]);
        }

        return values;
    }

    private extractCasts(castsContent: string): Record<string, string> {
        const casts: Record<string, string> = {};
        const regex = /['"`]([^'"`]+)['"`]\s*=>\s*['"`]([^'"`]+)['"`]/g;
        let match;

        while ((match = regex.exec(castsContent)) !== null) {
            casts[match[1]] = match[2];
        }

        return casts;
    }

    private castToType(cast: string): string {
        const typeMapping: Record<string, string> = {
            'integer': 'integer',
            'int': 'integer',
            'real': 'float',
            'float': 'float',
            'double': 'float',
            'decimal': 'decimal',
            'string': 'string',
            'boolean': 'boolean',
            'bool': 'boolean',
            'object': 'object',
            'array': 'array',
            'collection': 'collection',
            'date': 'date',
            'datetime': 'datetime',
            'timestamp': 'timestamp'
        };

        return typeMapping[cast] || 'string';
    }

    private extractRelationships(content: string): RelationshipInfo[] {
        const relationships: RelationshipInfo[] = [];
        const relationshipMethods = [
            'hasOne', 'hasMany', 'belongsTo', 'belongsToMany',
            'hasOneThrough', 'hasManyThrough', 'morphTo',
            'morphOne', 'morphMany', 'morphToMany'
        ];

        relationshipMethods.forEach(method => {
            const regex = new RegExp(
                `public\\s+function\\s+(\\w+)\\s*\\([^)]*\\)\\s*{[^}]*${method}\\s*\\(\\s*([^,)]+)`,
                'g'
            );
            let match;

            while ((match = regex.exec(content)) !== null) {
                const relationshipName = match[1];
                let relatedModel = match[2].trim();

                // Clean up the related model reference
                relatedModel = relatedModel.replace(/['"`]/g, '').replace(/::class/, '');
                if (relatedModel.includes('\\')) {
                    relatedModel = relatedModel.split('\\').pop() || relatedModel;
                }

                relationships.push({
                    name: relationshipName,
                    type: method,
                    relatedModel
                });
            }
        });

        return relationships;
    }

    private analyzeMigrations() {
        this.migrations.clear();

        const migrationsPath = path.join(this.workspaceRoot, 'database', 'migrations');
        if (!fs.existsSync(migrationsPath)) return;

        const migrationFiles = fs.readdirSync(migrationsPath)
            .filter(file => file.endsWith('.php'))
            .sort(); // Process in chronological order

        migrationFiles.forEach(file => {
            const filePath = path.join(migrationsPath, file);
            this.parseMigrationFile(filePath);
        });
    }

    private parseMigrationFile(filePath: string) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');

            // Extract table name from Schema::create or Schema::table
            const createMatch = content.match(/Schema::create\s*\(\s*['"`]([^'"`]+)['"`]/);
            const tableMatch = content.match(/Schema::table\s*\(\s*['"`]([^'"`]+)['"`]/);

            const tableName = createMatch?.[1] || tableMatch?.[1];
            if (!tableName) return;

            if (!this.migrations.has(tableName)) {
                this.migrations.set(tableName, []);
            }

            const fields = this.migrations.get(tableName)!;

            // Parse column definitions
            const columnPatterns = [
                // $table->string('name', 100)->nullable()->default('value')
                /\$table->(\w+)\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*(\d+))?\s*\)([^;]*);/g,
                // $table->timestamps(), $table->softDeletes(), etc.
                /\$table->(\w+)\s*\(\s*\)([^;]*);/g
            ];

            columnPatterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    const [, columnType, columnName, length, modifiers] = match;

                    if (columnName) {
                        // Regular column
                        const field: ModelField = {
                            name: columnName,
                            type: this.migrationTypeToType(columnType),
                            nullable: modifiers?.includes('nullable()') || false,
                            default: this.extractDefault(modifiers)
                        };

                        // Update existing field or add new one
                        const existingIndex = fields.findIndex(f => f.name === columnName);
                        if (existingIndex >= 0) {
                            fields[existingIndex] = field;
                        } else {
                            fields.push(field);
                        }
                    } else {
                        // Special methods like timestamps(), softDeletes()
                        this.handleSpecialMigrationMethods(columnType, fields);
                    }
                }
            });
        } catch (error) {
            console.error(`Error parsing migration file ${filePath}:`, error);
        }
    }

    private migrationTypeToType(migrationColumnType: string): string {
        const typeMapping: Record<string, string> = {
            'id': 'integer',
            'bigIncrements': 'integer',
            'increments': 'integer',
            'integer': 'integer',
            'bigInteger': 'integer',
            'smallInteger': 'integer',
            'tinyInteger': 'integer',
            'unsignedInteger': 'integer',
            'unsignedBigInteger': 'integer',
            'string': 'string',
            'text': 'string',
            'mediumText': 'string',
            'longText': 'string',
            'char': 'string',
            'boolean': 'boolean',
            'date': 'date',
            'dateTime': 'datetime',
            'time': 'time',
            'timestamp': 'timestamp',
            'timestamps': 'timestamp',
            'decimal': 'decimal',
            'double': 'float',
            'float': 'float',
            'json': 'json',
            'jsonb': 'json',
            'binary': 'binary',
            'enum': 'string',
            'uuid': 'string'
        };

        return typeMapping[migrationColumnType] || 'string';
    }

    private extractDefault(modifiers: string): string | undefined {
        const defaultMatch = modifiers?.match(/default\s*\(\s*['"`]?([^'"`)]*)['"`]?\s*\)/);
        return defaultMatch?.[1];
    }

    private handleSpecialMigrationMethods(method: string, fields: ModelField[]) {
        switch (method) {
            case 'timestamps':
                if (!fields.find(f => f.name === 'created_at')) {
                    fields.push({ name: 'created_at', type: 'timestamp', nullable: true });
                }
                if (!fields.find(f => f.name === 'updated_at')) {
                    fields.push({ name: 'updated_at', type: 'timestamp', nullable: true });
                }
                break;
            case 'softDeletes':
                if (!fields.find(f => f.name === 'deleted_at')) {
                    fields.push({ name: 'deleted_at', type: 'timestamp', nullable: true });
                }
                break;
            case 'rememberToken':
                if (!fields.find(f => f.name === 'remember_token')) {
                    fields.push({ name: 'remember_token', type: 'string', nullable: true });
                }
                break;
        }
    }

    private analyzeViews() {
        this.views.clear();

        const viewsPath = path.join(this.workspaceRoot, 'resources', 'views');
        if (!fs.existsSync(viewsPath)) return;

        this.scanViewDirectory(viewsPath, '');
    }

    private scanViewDirectory(dir: string, prefix: string) {
        const files = fs.readdirSync(dir, { withFileTypes: true });

        files.forEach(file => {
            if (file.isDirectory()) {
                const newPrefix = prefix ? `${prefix}.${file.name}` : file.name;
                this.scanViewDirectory(path.join(dir, file.name), newPrefix);
            } else if (file.name.endsWith('.blade.php')) {
                const viewName = file.name.replace('.blade.php', '');
                const fullViewName = prefix ? `${prefix}.${viewName}` : viewName;

                const filePath = path.join(dir, file.name);
                this.parseViewFile(filePath, fullViewName);
            }
        });
    }

    private parseViewFile(filePath: string, viewName: string) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');

            const view: ViewInfo = {
                name: viewName,
                path: filePath,
                variables: [],
                sections: []
            };

            // Extract extends
            const extendsMatch = content.match(/@extends\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
            if (extendsMatch) {
                view.extends = extendsMatch[1];
            }

            // Extract sections
            const sectionMatches = content.matchAll(/@section\s*\(\s*['"`]([^'"`]+)['"`]/g);
            for (const match of sectionMatches) {
                view.sections.push(match[1]);
            }

            // Extract variables (this is a simplified approach)
            // Look for {{ $variable }} and {!! $variable !!}
            const variableMatches = content.matchAll(/\{\{[!]?\s*\$([a-zA-Z_][a-zA-Z0-9_]*)/g);
            const variableSet = new Set<string>();

            for (const match of variableMatches) {
                variableSet.add(match[1]);
            }

            view.variables = Array.from(variableSet);

            this.views.set(viewName, view);
        } catch (error) {
            console.error(`Error parsing view file ${filePath}:`, error);
        }
    }

    // Main completion provider method
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.CompletionItem[] {
        const lineText = document.lineAt(position).text;
        const beforeCursor = lineText.substring(0, position.character);

        console.log('Completion triggered, before cursor:', beforeCursor);

        // Model attribute completion (highest priority)
        const modelCompletion = this.provideModelAttributeCompletion(beforeCursor, document, position);
        if (modelCompletion.length > 0) {
            console.log('Returning model completions:', modelCompletion.length);
            return modelCompletion;
        }

        // View name completion
        const viewNameCompletion = this.provideViewNameCompletion(beforeCursor);
        if (viewNameCompletion.length > 0) {
            return viewNameCompletion;
        }

        // View variable completion
        const viewVariableCompletion = this.provideViewVariableCompletion(beforeCursor, document, position);
        if (viewVariableCompletion.length > 0) {
            return viewVariableCompletion;
        }

        return [];
    }

    private provideModelAttributeCompletion(
        beforeCursor: string,
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        // Detect various patterns for model attribute access
        const patterns = [
            // Post::create([
            /(\w+)::create\s*\(\s*\[\s*['"`]?(\w*)$/,
            // Post::update([
            /(\w+)::update\s*\(\s*\[\s*['"`]?(\w*)$/,
            // $model->field
            /\$(\w+)->(\w*)$/,
            // $this->field (in model methods)
            /\$this->(\w*)$/,
            // $model->update([
            /\$\w+->update\s*\(\s*\[\s*['"`]?(\w*)$/,
            // $model->fill([
            /\$\w+->fill\s*\(\s*\[\s*['"`]?(\w*)$/,
            // ['field' => value] inside arrays (when last quote is incomplete)
            /\[\s*['"`](\w*)$/
        ];

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const match = beforeCursor.match(pattern);
            if (match) {
                console.log(`Pattern ${i} matched:`, match);

                let modelName: string | null = null;
                let prefix = '';

                if (i === 0 || i === 1) {
                    // Static method calls like Post::create([
                    modelName = match[1];
                    prefix = match[2] || '';
                } else if (i === 2) {
                    // $model->field
                    modelName = this.inferModelFromVariable(document, position, match[1]);
                    prefix = match[2] || '';
                } else if (i === 3) {
                    // $this->field
                    modelName = this.inferModelFromClass(document);
                    prefix = match[1] || '';
                } else {
                    // Other patterns
                    prefix = match[match.length - 1] || '';
                    modelName = this.inferModelFromContext(document, position);
                }

                console.log(`Model name: ${modelName}, Prefix: ${prefix}`);

                if (modelName) {
                    const completions = this.getModelAttributeCompletions(modelName, prefix);
                    if (completions.length > 0) {
                        return completions;
                    }
                }
            }
        }

        return [];
    }

    private inferModelFromVariable(
        document: vscode.TextDocument,
        position: vscode.Position,
        variableName: string
    ): string | null {
        const text = document.getText();

        // Look for variable assignment patterns
        const patterns = [
            // $user = User::find()
            new RegExp(`\\$${variableName}\\s*=\\s*(\\w+)::`),
            // $user = new User()
            new RegExp(`\\$${variableName}\\s*=\\s*new\\s+(\\w+)`),
            // function method(User $user)
            new RegExp(`function\\s+\\w+\\s*\\([^)]*\\b(\\w+)\\s+\\$${variableName}\\b`),
            // public function method(User $user)
            new RegExp(`public\\s+function\\s+\\w+\\s*\\([^)]*\\b(\\w+)\\s+\\$${variableName}\\b`)
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                console.log(`Variable ${variableName} inferred as ${match[1]}`);
                return match[1];
            }
        }

        return null;
    }

    private inferModelFromClass(document: vscode.TextDocument): string | null {
        const text = document.getText();

        // Look for class context (if we're inside a model class)
        const classMatch = text.match(/class\s+(\w+)\s+extends\s+(?:Model|Authenticatable)/);
        if (classMatch) {
            console.log(`Inferred model from class: ${classMatch[1]}`);
            return classMatch[1];
        }

        return null;
    }

    private inferModelFromContext(
        document: vscode.TextDocument,
        position: vscode.Position,
        variableName?: string
    ): string | null {
        // First try variable inference if we have a variable name
        if (variableName) {
            const modelFromVar = this.inferModelFromVariable(document, position, variableName);
            if (modelFromVar) return modelFromVar;
        }

        // Then try class inference
        return this.inferModelFromClass(document);
    }

    private getModelAttributeCompletions(modelName: string, prefix: string): vscode.CompletionItem[] {
        const model = this.models.get(modelName);
        if (!model) {
            console.log(`Model ${modelName} not found in models:`, Array.from(this.models.keys()));
            return [];
        }

        console.log(`Found model ${modelName} with ${model.fields.length} fields`);
        const completions: vscode.CompletionItem[] = [];

        // Add model fields
        model.fields.forEach(field => {
            if (!prefix || field.name.startsWith(prefix)) {
                const item = new vscode.CompletionItem(field.name, vscode.CompletionItemKind.Field);
                item.detail = `${field.type}${field.nullable ? ' | null' : ''}`;
                item.documentation = new vscode.MarkdownString(
                    `**Type:** ${field.type}\n\n` +
                    `**Nullable:** ${field.nullable ? 'Yes' : 'No'}\n\n` +
                    (field.default ? `**Default:** ${field.default}\n\n` : '') +
                    (field.comment ? `**Comment:** ${field.comment}` : '')
                );

                // For array context, insert with quotes
                item.insertText = `'${field.name}'`;

                // Add type-specific icons
                switch (field.type) {
                    case 'integer':
                        item.kind = vscode.CompletionItemKind.Value;
                        break;
                    case 'boolean':
                        item.kind = vscode.CompletionItemKind.Value;
                        break;
                    case 'datetime':
                    case 'date':
                    case 'timestamp':
                        item.kind = vscode.CompletionItemKind.Event;
                        break;
                    default:
                        item.kind = vscode.CompletionItemKind.Field;
                }

                completions.push(item);
            }
        });

        // Add relationships
        model.relationships.forEach(rel => {
            if (!prefix || rel.name.startsWith(prefix)) {
                const item = new vscode.CompletionItem(rel.name, vscode.CompletionItemKind.Reference);
                item.detail = `${rel.type} → ${rel.relatedModel}`;
                item.documentation = new vscode.MarkdownString(
                    `**Relationship:** ${rel.type}\n\n` +
                    `**Related Model:** ${rel.relatedModel}`
                );
                item.insertText = `'${rel.name}'`;
                completions.push(item);
            }
        });

        console.log(`Returning ${completions.length} completions for ${modelName}`);
        return completions;
    }

    private provideViewNameCompletion(beforeCursor: string): vscode.CompletionItem[] {
        const patterns = [
            // view('viewname')
            /view\s*\(\s*['"`]([^'"`]*)$/,
            // View::make('viewname')
            /View::make\s*\(\s*['"`]([^'"`]*)$/,
            // @extends('viewname')
            /@extends\s*\(\s*['"`]([^'"`]*)$/,
            // @include('viewname')
            /@include\s*\(\s*['"`]([^'"`]*)$/,
            // @component('viewname')
            /@component\s*\(\s*['"`]([^'"`]*)$/
        ];

        for (const pattern of patterns) {
            const match = beforeCursor.match(pattern);
            if (match) {
                const prefix = match[1];
                return this.getViewNameCompletions(prefix);
            }
        }

        return [];
    }

    private getViewNameCompletions(prefix: string): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];

        this.views.forEach((view, viewName) => {
            if (viewName.startsWith(prefix)) {
                const item = new vscode.CompletionItem(viewName, vscode.CompletionItemKind.File);
                item.detail = path.relative(this.workspaceRoot, view.path);
                item.documentation = new vscode.MarkdownString(
                    `**View:** ${viewName}\n\n` +
                    `**Path:** ${view.path}\n\n` +
                    (view.extends ? `**Extends:** ${view.extends}\n\n` : '') +
                    (view.sections.length > 0 ? `**Sections:** ${view.sections.join(', ')}\n\n` : '') +
                    (view.variables.length > 0 ? `**Variables:** ${view.variables.join(', ')}` : '')
                );

                // Insert just the view name without quotes
                item.insertText = viewName;
                completions.push(item);
            }
        });

        return completions;
    }

    private provideViewVariableCompletion(
        beforeCursor: string,
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const patterns = [
            // view('name', ['var' => 
            /view\s*\(\s*['"`][^'"`]+['"`]\s*,\s*\[\s*['"`](\w*)$/,
            // view('name')->with('var'
            /view\s*\([^)]+\)->with\s*\(\s*['"`](\w*)$/,
            // compact('var1', 'var2'
            /compact\s*\(\s*['"`](\w*)$/
        ];

        for (const pattern of patterns) {
            const match = beforeCursor.match(pattern);
            if (match) {
                // For now, return common variable names
                // In a full implementation, you'd analyze controller methods
                return this.getCommonViewVariables(match[1]);
            }
        }

        return [];
    }

    private getCommonViewVariables(prefix: string): vscode.CompletionItem[] {
        const commonVariables = [
            'title', 'user', 'users', 'data', 'items', 'item', 'model', 'models',
            'message', 'error', 'success', 'page', 'content', 'config'
        ];

        return commonVariables
            .filter(variable => variable.startsWith(prefix))
            .map(variable => {
                const item = new vscode.CompletionItem(variable, vscode.CompletionItemKind.Variable);
                item.detail = 'View variable';
                return item;
            });
    }

    // Public methods for external access
    public getModel(name: string): ModelInfo | undefined {
        return this.models.get(name);
    }

    public getAllModels(): ModelInfo[] {
        return Array.from(this.models.values());
    }

    public getView(name: string): ViewInfo | undefined {
        return this.views.get(name);
    }

    public getAllViews(): ViewInfo[] {
        return Array.from(this.views.values());
    }
}