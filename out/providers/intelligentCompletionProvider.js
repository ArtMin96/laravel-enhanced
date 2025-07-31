"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LaravelIntelligentCompletionProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
class LaravelIntelligentCompletionProvider {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.models = new Map();
        this.views = new Map();
        this.migrations = new Map();
        this.analyzeProject();
        this.setupWatchers();
    }
    setupWatchers() {
        // Watch model files
        const modelWatcher = vscode.workspace.createFileSystemWatcher('**/app/Models/**/*.php');
        modelWatcher.onDidChange(() => this.analyzeModels());
        modelWatcher.onDidCreate(() => this.analyzeModels());
        modelWatcher.onDidDelete(() => this.analyzeModels());
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
    analyzeProject() {
        this.analyzeModels();
        this.analyzeMigrations();
        this.analyzeViews();
    }
    analyzeModels() {
        this.models.clear();
        const modelsPath = path.join(this.workspaceRoot, 'app', 'Models');
        if (!fs.existsSync(modelsPath)) {
            // Fallback to app/ directory for older Laravel versions
            const appModelsPath = path.join(this.workspaceRoot, 'app');
            if (fs.existsSync(appModelsPath)) {
                this.scanModelDirectory(appModelsPath);
            }
            return;
        }
        this.scanModelDirectory(modelsPath);
    }
    scanModelDirectory(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        files.forEach(file => {
            if (file.isDirectory()) {
                this.scanModelDirectory(path.join(dir, file.name));
            }
            else if (file.name.endsWith('.php')) {
                const filePath = path.join(dir, file.name);
                this.parseModelFile(filePath);
            }
        });
    }
    parseModelFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const modelName = path.basename(filePath, '.php');
            // Skip if not a model class
            if (!content.includes('extends Model') && !content.includes('extends Authenticatable')) {
                return;
            }
            const model = {
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
                    model.fields.push({
                        name: field,
                        type: 'string',
                        nullable: false
                    });
                });
            }
            // Extract hidden fields
            const hiddenMatch = content.match(/protected\s+\$hidden\s*=\s*\[([\s\S]*?)\]/);
            if (hiddenMatch) {
                const hiddenFields = this.extractArrayValues(hiddenMatch[1]);
                hiddenFields.forEach(field => {
                    const existingField = model.fields.find(f => f.name === field);
                    if (!existingField) {
                        model.fields.push({
                            name: field,
                            type: 'string',
                            nullable: false
                        });
                    }
                });
            }
            // Extract casts
            const castsMatch = content.match(/protected\s+\$casts\s*=\s*\[([\s\S]*?)\]/);
            if (castsMatch) {
                const castEntries = this.extractCasts(castsMatch[1]);
                Object.entries(castEntries).forEach(([field, cast]) => {
                    const existingField = model.fields.find(f => f.name === field);
                    if (existingField) {
                        existingField.type = this.castToType(cast);
                    }
                    else {
                        model.fields.push({
                            name: field,
                            type: this.castToType(cast),
                            nullable: false
                        });
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
                    }
                    else {
                        // Add field from migration
                        model.fields.push(migrationField);
                    }
                });
            }
            // Add default fields that are always present
            const defaultFields = ['id', 'created_at', 'updated_at'];
            defaultFields.forEach(fieldName => {
                if (!model.fields.find(f => f.name === fieldName)) {
                    model.fields.push({
                        name: fieldName,
                        type: fieldName === 'id' ? 'integer' : 'datetime',
                        nullable: false
                    });
                }
            });
            this.models.set(modelName, model);
        }
        catch (error) {
            console.error(`Error parsing model file ${filePath}:`, error);
        }
    }
    extractTableName(content, modelName) {
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
    extractArrayValues(arrayContent) {
        const values = [];
        const regex = /['"`]([^'"`]+)['"`]/g;
        let match;
        while ((match = regex.exec(arrayContent)) !== null) {
            values.push(match[1]);
        }
        return values;
    }
    extractCasts(castsContent) {
        const casts = {};
        const regex = /['"`]([^'"`]+)['"`]\s*=>\s*['"`]([^'"`]+)['"`]/g;
        let match;
        while ((match = regex.exec(castsContent)) !== null) {
            casts[match[1]] = match[2];
        }
        return casts;
    }
    castToType(cast) {
        const typeMapping = {
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
    extractRelationships(content) {
        const relationships = [];
        const relationshipMethods = [
            'hasOne', 'hasMany', 'belongsTo', 'belongsToMany',
            'hasOneThrough', 'hasManyThrough', 'morphTo',
            'morphOne', 'morphMany', 'morphToMany'
        ];
        relationshipMethods.forEach(method => {
            const regex = new RegExp(`public\\s+function\\s+(\\w+)\\s*\\([^)]*\\)\\s*{[^}]*${method}\\s*\\(\\s*([^,)]+)`, 'g');
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
    analyzeMigrations() {
        this.migrations.clear();
        const migrationsPath = path.join(this.workspaceRoot, 'database', 'migrations');
        if (!fs.existsSync(migrationsPath))
            return;
        const migrationFiles = fs.readdirSync(migrationsPath)
            .filter(file => file.endsWith('.php'))
            .sort(); // Process in chronological order
        migrationFiles.forEach(file => {
            const filePath = path.join(migrationsPath, file);
            this.parseMigrationFile(filePath);
        });
    }
    parseMigrationFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            // Extract table name from Schema::create or Schema::table
            const createMatch = content.match(/Schema::create\s*\(\s*['"`]([^'"`]+)['"`]/);
            const tableMatch = content.match(/Schema::table\s*\(\s*['"`]([^'"`]+)['"`]/);
            const tableName = createMatch?.[1] || tableMatch?.[1];
            if (!tableName)
                return;
            if (!this.migrations.has(tableName)) {
                this.migrations.set(tableName, []);
            }
            const fields = this.migrations.get(tableName);
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
                        const field = {
                            name: columnName,
                            type: this.migrationTypeToType(columnType),
                            nullable: modifiers?.includes('nullable()') || false,
                            default: this.extractDefault(modifiers)
                        };
                        // Update existing field or add new one
                        const existingIndex = fields.findIndex(f => f.name === columnName);
                        if (existingIndex >= 0) {
                            fields[existingIndex] = field;
                        }
                        else {
                            fields.push(field);
                        }
                    }
                    else {
                        // Special methods like timestamps(), softDeletes()
                        this.handleSpecialMigrationMethods(columnType, fields);
                    }
                }
            });
        }
        catch (error) {
            console.error(`Error parsing migration file ${filePath}:`, error);
        }
    }
    migrationTypeToType(migrationColumnType) {
        const typeMapping = {
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
    extractDefault(modifiers) {
        const defaultMatch = modifiers?.match(/default\s*\(\s*['"`]?([^'"`)]*)['"`]?\s*\)/);
        return defaultMatch?.[1];
    }
    handleSpecialMigrationMethods(method, fields) {
        switch (method) {
            case 'timestamps':
                fields.push({ name: 'created_at', type: 'timestamp', nullable: true }, { name: 'updated_at', type: 'timestamp', nullable: true });
                break;
            case 'softDeletes':
                fields.push({ name: 'deleted_at', type: 'timestamp', nullable: true });
                break;
            case 'rememberToken':
                fields.push({ name: 'remember_token', type: 'string', nullable: true });
                break;
        }
    }
    analyzeViews() {
        this.views.clear();
        const viewsPath = path.join(this.workspaceRoot, 'resources', 'views');
        if (!fs.existsSync(viewsPath))
            return;
        this.scanViewDirectory(viewsPath, '');
    }
    scanViewDirectory(dir, prefix) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        files.forEach(file => {
            if (file.isDirectory()) {
                const newPrefix = prefix ? `${prefix}.${file.name}` : file.name;
                this.scanViewDirectory(path.join(dir, file.name), newPrefix);
            }
            else if (file.name.endsWith('.blade.php')) {
                const viewName = file.name.replace('.blade.php', '');
                const fullViewName = prefix ? `${prefix}.${viewName}` : viewName;
                const filePath = path.join(dir, file.name);
                this.parseViewFile(filePath, fullViewName);
            }
        });
    }
    parseViewFile(filePath, viewName) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const view = {
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
            const variableSet = new Set();
            for (const match of variableMatches) {
                variableSet.add(match[1]);
            }
            view.variables = Array.from(variableSet);
            this.views.set(viewName, view);
        }
        catch (error) {
            console.error(`Error parsing view file ${filePath}:`, error);
        }
    }
    // Main completion provider method
    provideCompletionItems(document, position, token, context) {
        const lineText = document.lineAt(position).text;
        const beforeCursor = lineText.substring(0, position.character);
        // Model attribute completion
        const modelCompletion = this.provideModelAttributeCompletion(beforeCursor, document, position);
        if (modelCompletion.length > 0) {
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
    provideModelAttributeCompletion(beforeCursor, document, position) {
        // Detect various patterns for model attribute access
        const patterns = [
            // $model->field
            /\$(\w+)->(\w*)$/,
            // $this->field (in model methods)
            /\$this->(\w*)$/,
            // Model::create([
            /(\w+)::create\s*\(\s*\[\s*['"`]?(\w*)$/,
            // $model->update([
            /\$\w+->update\s*\(\s*\[\s*['"`]?(\w*)$/,
            // $model->fill([
            /\$\w+->fill\s*\(\s*\[\s*['"`]?(\w*)$/,
            // ['field' => value] inside arrays
            /\[\s*['"`](\w*)$/
        ];
        for (const pattern of patterns) {
            const match = beforeCursor.match(pattern);
            if (match) {
                const modelName = this.inferModelFromContext(document, position, match[1]);
                if (modelName) {
                    return this.getModelAttributeCompletions(modelName, match[match.length - 1]);
                }
            }
        }
        return [];
    }
    inferModelFromContext(document, position, variableName) {
        const text = document.getText();
        // Look for variable assignment patterns
        if (variableName) {
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
                    return match[1];
                }
            }
        }
        // Look for class context (if we're inside a model class)
        const classMatch = text.match(/class\s+(\w+)\s+extends\s+(?:Model|Authenticatable)/);
        if (classMatch && document.fileName.includes(classMatch[1])) {
            return classMatch[1];
        }
        return null;
    }
    getModelAttributeCompletions(modelName, prefix) {
        const model = this.models.get(modelName);
        if (!model)
            return [];
        const completions = [];
        // Add model fields
        model.fields.forEach(field => {
            if (field.name.startsWith(prefix)) {
                const item = new vscode.CompletionItem(field.name, vscode.CompletionItemKind.Field);
                item.detail = `${field.type}${field.nullable ? ' | null' : ''}`;
                item.documentation = new vscode.MarkdownString(`**Type:** ${field.type}\n\n` +
                    `**Nullable:** ${field.nullable ? 'Yes' : 'No'}\n\n` +
                    (field.default ? `**Default:** ${field.default}\n\n` : '') +
                    (field.comment ? `**Comment:** ${field.comment}` : ''));
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
            if (rel.name.startsWith(prefix)) {
                const item = new vscode.CompletionItem(rel.name, vscode.CompletionItemKind.Reference);
                item.detail = `${rel.type} → ${rel.relatedModel}`;
                item.documentation = new vscode.MarkdownString(`**Relationship:** ${rel.type}\n\n` +
                    `**Related Model:** ${rel.relatedModel}`);
                completions.push(item);
            }
        });
        return completions;
    }
    provideViewNameCompletion(beforeCursor) {
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
    getViewNameCompletions(prefix) {
        const completions = [];
        this.views.forEach((view, viewName) => {
            if (viewName.startsWith(prefix)) {
                const item = new vscode.CompletionItem(viewName, vscode.CompletionItemKind.File);
                item.detail = path.relative(this.workspaceRoot, view.path);
                item.documentation = new vscode.MarkdownString(`**View:** ${viewName}\n\n` +
                    `**Path:** ${view.path}\n\n` +
                    (view.extends ? `**Extends:** ${view.extends}\n\n` : '') +
                    (view.sections.length > 0 ? `**Sections:** ${view.sections.join(', ')}\n\n` : '') +
                    (view.variables.length > 0 ? `**Variables:** ${view.variables.join(', ')}` : ''));
                // Insert just the view name without quotes
                item.insertText = viewName;
                completions.push(item);
            }
        });
        return completions;
    }
    provideViewVariableCompletion(beforeCursor, document, position) {
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
    getCommonViewVariables(prefix) {
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
    getModel(name) {
        return this.models.get(name);
    }
    getAllModels() {
        return Array.from(this.models.values());
    }
    getView(name) {
        return this.views.get(name);
    }
    getAllViews() {
        return Array.from(this.views.values());
    }
}
exports.LaravelIntelligentCompletionProvider = LaravelIntelligentCompletionProvider;
//# sourceMappingURL=intelligentCompletionProvider.js.map