import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ValidationRule {
    name: string;
    description: string;
    parameters?: ValidationParameter[];
    examples: string[];
    category: string;
    phpDocUrl?: string;
}

export interface ValidationParameter {
    name: string;
    type: string;
    required: boolean;
    description: string;
    examples?: string[];
}

export interface DatabaseTable {
    name: string;
    columns: string[];
}

export class LaravelValidationCompletionProvider implements vscode.CompletionItemProvider {
    private validationRules: ValidationRule[] = [];
    private databaseTables: Map<string, DatabaseTable> = new Map();
    private modelColumns: Map<string, string[]> = new Map();

    constructor(private workspaceRoot: string) {
        this.initializeValidationRules();
        this.analyzeDatabaseSchema();
        this.setupWatchers();
    }

    private setupWatchers() {
        // Watch migration files for database schema changes
        const migrationWatcher = vscode.workspace.createFileSystemWatcher('**/database/migrations/**/*.php');
        migrationWatcher.onDidChange(() => this.analyzeDatabaseSchema());
        migrationWatcher.onDidCreate(() => this.analyzeDatabaseSchema());
        migrationWatcher.onDidDelete(() => this.analyzeDatabaseSchema());

        // Watch model files for table relationships
        const modelWatcher = vscode.workspace.createFileSystemWatcher('**/app/Models/**/*.php');
        modelWatcher.onDidChange(() => this.analyzeModels());
        modelWatcher.onDidCreate(() => this.analyzeModels());
        modelWatcher.onDidDelete(() => this.analyzeModels());
    }

    private initializeValidationRules() {
        this.validationRules = [
            // Basic Rules
            {
                name: 'required',
                description: 'The field under validation must be present in the input data and not empty',
                examples: ['required'],
                category: 'Basic',
                phpDocUrl: 'https://laravel.com/docs/validation#rule-required'
            },
            {
                name: 'nullable',
                description: 'The field under validation may be null',
                examples: ['nullable'],
                category: 'Basic'
            },
            {
                name: 'string',
                description: 'The field under validation must be a string',
                examples: ['string'],
                category: 'String'
            },
            {
                name: 'integer',
                description: 'The field under validation must be an integer',
                examples: ['integer'],
                category: 'Numeric'
            },
            {
                name: 'numeric',
                description: 'The field under validation must be numeric',
                examples: ['numeric'],
                category: 'Numeric'
            },
            {
                name: 'boolean',
                description: 'The field under validation must be able to be cast as a boolean',
                examples: ['boolean'],
                category: 'Boolean'
            },
            {
                name: 'email',
                description: 'The field under validation must be formatted as an email address',
                examples: ['email', 'email:rfc,dns'],
                category: 'Format'
            },
            {
                name: 'min',
                description: 'The field under validation must have a minimum value/length',
                parameters: [
                    { name: 'value', type: 'integer', required: true, description: 'Minimum value or length' }
                ],
                examples: ['min:3', 'min:8'],
                category: 'Size'
            },
            {
                name: 'max',
                description: 'The field under validation must have a maximum value/length',
                parameters: [
                    { name: 'value', type: 'integer', required: true, description: 'Maximum value or length' }
                ],
                examples: ['max:255', 'max:100'],
                category: 'Size'
            },
            {
                name: 'confirmed',
                description: 'The field under validation must have a matching field of {field}_confirmation',
                examples: ['confirmed'],
                category: 'Confirmation'
            },
            {
                name: 'unique',
                description: 'The field under validation must not exist within the given database table',
                parameters: [
                    { name: 'table', type: 'string', required: true, description: 'Table name or model' },
                    { name: 'column', type: 'string', required: false, description: 'Column name' }
                ],
                examples: ['unique:users', 'unique:users,email'],
                category: 'Database'
            },
            {
                name: 'exists',
                description: 'The field under validation must exist in a given database table',
                parameters: [
                    { name: 'table', type: 'string', required: true, description: 'Table name or model' },
                    { name: 'column', type: 'string', required: false, description: 'Column name' }
                ],
                examples: ['exists:users', 'exists:users,id'],
                category: 'Database'
            },
            {
                name: 'in',
                description: 'The field under validation must be included in the given list of values',
                parameters: [
                    { name: 'values', type: 'string', required: true, description: 'Comma-separated list of allowed values' }
                ],
                examples: ['in:admin,user,guest', 'in:red,green,blue'],
                category: 'Options'
            },
            {
                name: 'regex',
                description: 'The field under validation must match the given regular expression',
                parameters: [
                    { name: 'pattern', type: 'string', required: true, description: 'Regular expression pattern' }
                ],
                examples: ['regex:/^[A-Za-z0-9]+$/', 'regex:/^\\+?[1-9]\\d{1,14}$/'],
                category: 'Pattern'
            },
            {
                name: 'date',
                description: 'The field under validation must be a valid, non-relative date',
                examples: ['date'],
                category: 'Date'
            },
            {
                name: 'file',
                description: 'The field under validation must be a successfully uploaded file',
                examples: ['file'],
                category: 'File'
            },
            {
                name: 'image',
                description: 'The field under validation must be an image (jpeg, png, bmp, gif, svg, or webp)',
                examples: ['image'],
                category: 'File'
            }
        ];
    }

    private analyzeDatabaseSchema() {
        this.databaseTables.clear();
        
        const migrationsPath = path.join(this.workspaceRoot, 'database', 'migrations');
        if (!fs.existsSync(migrationsPath)) return;
        
        const migrationFiles = fs.readdirSync(migrationsPath)
            .filter(file => file.endsWith('.php'))
            .sort();
        
        migrationFiles.forEach(file => {
            const filePath = path.join(migrationsPath, file);
            this.parseMigrationForSchema(filePath);
        });
    }

    private parseMigrationForSchema(filePath: string) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Extract table name from Schema::create
            const createMatch = content.match(/Schema::create\s*\(\s*['"`]([^'"`]+)['"`]/);
            if (!createMatch) return;
            
            const tableName = createMatch[1];
            const columns: string[] = [];
            
            // Extract column definitions
            const columnPatterns = [
                /\$table->(?:big)?id\s*\(\s*(?:['"`]([^'"`]+)['"`])?\s*\)/g,
                /\$table->\w+\s*\(\s*['"`]([^'"`]+)['"`]/g,
                /\$table->timestamps\s*\(\s*\)/g,
                /\$table->softDeletes\s*\(\s*\)/g
            ];
            
            columnPatterns.forEach((pattern, index) => {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    if (index === 0) {
                        // ID column
                        columns.push(match[1] || 'id');
                    } else if (index === 1) {
                        // Regular columns
                        columns.push(match[1]);
                    } else if (index === 2) {
                        // Timestamps
                        columns.push('created_at', 'updated_at');
                    } else if (index === 3) {
                        // Soft deletes
                        columns.push('deleted_at');
                    }
                }
            });
            
            this.databaseTables.set(tableName, { name: tableName, columns });
        } catch (error) {
            console.error(`Error parsing migration ${filePath}:`, error);
        }
    }

    private analyzeModels() {
        this.modelColumns.clear();
        
        const modelsPath = path.join(this.workspaceRoot, 'app', 'Models');
        if (!fs.existsSync(modelsPath)) return;
        
        this.scanModelsDirectory(modelsPath);
    }

    private scanModelsDirectory(dir: string) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        files.forEach(file => {
            if (file.isDirectory()) {
                this.scanModelsDirectory(path.join(dir, file.name));
            } else if (file.name.endsWith('.php')) {
                const filePath = path.join(dir, file.name);
                this.parseModelForColumns(filePath);
            }
        });
    }

    private parseModelForColumns(filePath: string) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const modelName = path.basename(filePath, '.php');
            
            if (!content.includes('extends Model') && !content.includes('extends Authenticatable')) {
                return;
            }
            
            // Extract table name
            const tableMatch = content.match(/protected\s+\$table\s*=\s*['"`]([^'"`]+)['"`]/);
            const tableName = tableMatch ? tableMatch[1] : this.modelNameToTableName(modelName);
            
            // Get columns from database schema
            const table = this.databaseTables.get(tableName);
            if (table) {
                this.modelColumns.set(modelName, table.columns);
            }
        } catch (error) {
            console.error(`Error parsing model ${filePath}:`, error);
        }
    }

    private modelNameToTableName(modelName: string): string {
        return modelName
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .substring(1) + 's';
    }

    // Main completion provider method (implementing CompletionItemProvider interface)
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.CompletionItem[] {
        const lineText = document.lineAt(position).text;
        const beforeCursor = lineText.substring(0, position.character);
        
        // Check if we're in a validation rules context
        if (this.isInValidationContext(beforeCursor, document, position)) {
            return this.provideValidationRuleCompletions(beforeCursor, document, position);
        }
        
        return [];
    }

    private isInValidationContext(beforeCursor: string, document: vscode.TextDocument, position: vscode.Position): boolean {
        // Check various validation contexts
        const validationPatterns = [
            // 'field' => 'required|string|max:255'
            /['"`][^'"`]*['"`]\s*=>\s*['"`][^'"`]*$/,
            // 'field' => ['required', 'string', 'max:255']
            /['"`][^'"`]*['"`]\s*=>\s*\[[^\]]*['"`][^'"`]*$/,
            // Inside rules() method return array
            /return\s*\[[\s\S]*['"`][^'"`]*['"`]\s*=>\s*['"`][^'"`]*$/,
            // Validator::make rules
            /Validator::make\s*\([^,]+,\s*\[[^\]]*['"`][^'"`]*['"`]\s*=>\s*['"`][^'"`]*$/,
            // $this->validate rules
            /\$this->validate\s*\([^,]+,\s*\[[^\]]*['"`][^'"`]*['"`]\s*=>\s*['"`][^'"`]*$/,
            // Request rules in array format
            /['"`]([^'"`]+)['"`]\s*=>\s*\[\s*['"`][^'"`]*$/
        ];

        return validationPatterns.some(pattern => pattern.test(beforeCursor));
    }

    private provideValidationRuleCompletions(
        beforeCursor: string,
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        // Determine if we're in a pipe-separated string or array context
        const isArrayContext = beforeCursor.includes('[') && !beforeCursor.includes(']');
        const currentRules = this.extractCurrentRules(beforeCursor, isArrayContext);
        
        // Get current field name for context-aware suggestions
        const fieldName = this.extractFieldName(beforeCursor);
        
        // Filter rules based on what's already applied
        const availableRules = this.validationRules.filter(rule => 
            !currentRules.includes(rule.name) && this.isRuleApplicable(rule, currentRules, fieldName)
        );
        
        // Add rule completions
        availableRules.forEach(rule => {
            const completion = this.createRuleCompletion(rule, isArrayContext, fieldName);
            completions.push(completion);
        });
        
        return completions;
    }

    private extractCurrentRules(beforeCursor: string, isArrayContext: boolean): string[] {
        if (isArrayContext) {
            // Extract rules from array context: ['required', 'string', ...]
            const arrayMatch = beforeCursor.match(/\[(.*?)$/);
            if (arrayMatch) {
                const rulesText = arrayMatch[1];
                return rulesText.split(',')
                    .map(rule => rule.trim().replace(/['"`]/g, '').split(':')[0])
                    .filter(rule => rule.length > 0);
            }
        } else {
            // Extract rules from pipe-separated string: 'required|string|max:255'
            const ruleMatch = beforeCursor.match(/['"`]([^'"`]+)$/);
            if (ruleMatch) {
                return ruleMatch[1].split('|')
                    .map(rule => rule.trim().split(':')[0])
                    .filter(rule => rule.length > 0);
            }
        }
        
        return [];
    }

    private extractFieldName(beforeCursor: string): string {
        const fieldMatch = beforeCursor.match(/['"`]([^'"`]+)['"`]\s*=>/);
        return fieldMatch ? fieldMatch[1] : '';
    }

    private isRuleApplicable(rule: ValidationRule, currentRules: string[], fieldName: string): boolean {
        // Rules that can't be combined
        const mutuallyExclusive: Record<string, string[]> = {
            'required': ['nullable', 'sometimes'],
            'nullable': ['required'],
            'string': ['numeric', 'integer', 'boolean', 'array', 'file', 'image'],
            'numeric': ['string', 'boolean', 'array', 'file', 'image'],
            'integer': ['string', 'boolean', 'array', 'file', 'image', 'decimal'],
            'boolean': ['string', 'numeric', 'integer', 'array', 'file', 'image'],
            'array': ['string', 'numeric', 'integer', 'boolean', 'file', 'image'],
            'file': ['string', 'numeric', 'integer', 'boolean', 'array'],
            'image': ['string', 'numeric', 'integer', 'boolean', 'array']
        };

        // Check if rule conflicts with existing rules
        const conflicts = mutuallyExclusive[rule.name] || [];
        if (conflicts.some((conflict: string) => currentRules.includes(conflict))) {
            return false;
        }

        // Check if existing rules conflict with this rule
        for (const existingRule of currentRules) {
            const existingConflicts = mutuallyExclusive[existingRule] || [];
            if (existingConflicts.includes(rule.name)) {
                return false;
            }
        }

        return true;
    }

    private createRuleCompletion(rule: ValidationRule, isArrayContext: boolean, fieldName: string): vscode.CompletionItem {
        const item = new vscode.CompletionItem(rule.name, vscode.CompletionItemKind.Method);
        
        // Set detail and documentation
        item.detail = `${rule.category} • ${rule.description}`;
        item.documentation = this.createRuleDocumentation(rule, fieldName);
        
        // Create smart insert text based on context
        item.insertText = this.createRuleInsertText(rule, isArrayContext, fieldName);
        
        // Add sorting preference based on common usage
        item.sortText = this.getRuleSortText(rule, fieldName);
        
        return item;
    }

    private createRuleDocumentation(rule: ValidationRule, fieldName: string): vscode.MarkdownString {
        const doc = new vscode.MarkdownString();
        
        doc.appendMarkdown(`## ${rule.name}\n\n`);
        doc.appendMarkdown(`**Category:** ${rule.category}\n\n`);
        doc.appendMarkdown(`**Description:** ${rule.description}\n\n`);
        
        if (rule.parameters && rule.parameters.length > 0) {
            doc.appendMarkdown(`**Parameters:**\n`);
            rule.parameters.forEach(param => {
                const required = param.required ? '**required**' : '*optional*';
                doc.appendMarkdown(`- \`${param.name}\` (${param.type}) - ${required}: ${param.description}\n`);
                if (param.examples) {
                    doc.appendMarkdown(`  - Examples: ${param.examples.join(', ')}\n`);
                }
            });
            doc.appendMarkdown(`\n`);
        }
        
        doc.appendMarkdown(`**Examples:**\n`);
        rule.examples.forEach(example => {
            // Contextualize examples with current field name
            const contextualExample = fieldName ? `'${fieldName}' => '${example}'` : `'field' => '${example}'`;
            doc.appendMarkdown(`- \`${contextualExample}\`\n`);
        });
        
        if (rule.phpDocUrl) {
            doc.appendMarkdown(`\n[📖 Laravel Documentation](${rule.phpDocUrl})`);
        }
        
        return doc;
    }

    private createRuleInsertText(rule: ValidationRule, isArrayContext: boolean, fieldName: string): vscode.SnippetString {
        let insertText = rule.name;
        
        // Add parameter placeholders for rules that need them
        if (rule.parameters && rule.parameters.length > 0) {
            const params = rule.parameters.map((param, index) => {
                return this.getParameterPlaceholder(param, fieldName, index + 1);
            }).join(',');
            
            insertText += `:${params}`;
        }
        
        // Format for array or string context
        if (isArrayContext) {
            insertText = `'${insertText}'`;
        }
        
        return new vscode.SnippetString(insertText);
    }

    private getParameterPlaceholder(param: ValidationParameter, fieldName: string, index: number): string {
        // Provide smart defaults based on parameter type and field name
        if (param.name === 'table' && fieldName) {
            // For exists/unique rules, suggest table name based on field
            if (fieldName.endsWith('_id')) {
                const tableName = fieldName.replace('_id', 's');
                return `\${${index}:${tableName}}`;
            }
            return `\${${index}:users}`;
        }
        
        if (param.name === 'value' && param.type === 'integer') {
            // Suggest common values for size constraints
            if (fieldName.includes('password')) return `\${${index}:8}`;
            if (fieldName.includes('name')) return `\${${index}:255}`;
            if (fieldName.includes('email')) return `\${${index}:255}`;
            return `\${${index}:100}`;
        }
        
        if (param.examples && param.examples.length > 0) {
            return `\${${index}:${param.examples[0]}}`;
        }
        
        return `\${${index}:${param.description.toLowerCase().replace(/\s+/g, '_')}}`;
    }

    private getRuleSortText(rule: ValidationRule, fieldName: string): string {
        // Prioritize common rules and field-specific rules
        const priorities: Record<string, number> = {
            'required': 1,
            'nullable': 2,
            'string': 3,
            'integer': 3,
            'numeric': 3,
            'boolean': 3,
            'array': 3,
            'max': 4,
            'min': 4,
            'email': 5,
            'unique': 6,
            'exists': 6
        };
        
        let priority = priorities[rule.name] || 10;
        
        // Boost priority for field-specific rules
        if (fieldName) {
            if (fieldName.includes('email') && rule.name === 'email') priority = 1;
            if (fieldName.includes('password') && rule.name === 'confirmed') priority = 2;
            if (fieldName.endsWith('_id') && (rule.name === 'exists' || rule.name === 'integer')) priority = 2;
        }
        
        return priority.toString().padStart(2, '0');
    }

    // Public methods for external access
    public getValidationRules(): ValidationRule[] {
        return this.validationRules;
    }

    public getValidationRule(name: string): ValidationRule | undefined {
        return this.validationRules.find(rule => rule.name === name);
    }

    public getDatabaseTables(): Map<string, DatabaseTable> {
        return this.databaseTables;
    }
}