import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface RequestRule {
    field: string;
    rules: string[];
    comment?: string;
}

interface RequestInfo {
    name: string;
    fields: RequestRule[];
    filePath: string;
}

export class LaravelRequestCompletionProvider implements vscode.CompletionItemProvider {
    private requests: Map<string, RequestInfo> = new Map();

    constructor(private workspaceRoot: string) {
        this.analyzeRequests();
        this.setupWatchers();
    }

    private setupWatchers() {
        const requestWatcher = vscode.workspace.createFileSystemWatcher('**/app/Http/Requests/**/*.php');
        requestWatcher.onDidChange(() => this.analyzeRequests());
        requestWatcher.onDidCreate(() => this.analyzeRequests());
        requestWatcher.onDidDelete(() => this.analyzeRequests());
    }

    private analyzeRequests() {
        this.requests.clear();
        
        const requestsPath = path.join(this.workspaceRoot, 'app', 'Http', 'Requests');
        if (!fs.existsSync(requestsPath)) return;
        
        this.scanRequestDirectory(requestsPath);
    }

    private scanRequestDirectory(dir: string) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        files.forEach(file => {
            if (file.isDirectory()) {
                this.scanRequestDirectory(path.join(dir, file.name));
            } else if (file.name.endsWith('.php')) {
                const filePath = path.join(dir, file.name);
                this.parseRequestFile(filePath);
            }
        });
    }

    private parseRequestFile(filePath: string) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const requestName = path.basename(filePath, '.php');
            
            // Skip if not a FormRequest class
            if (!content.includes('extends FormRequest')) {
                return;
            }

            const request: RequestInfo = {
                name: requestName,
                fields: [],
                filePath
            };

            // Extract validation rules from rules() method
            const rulesMethodMatch = content.match(/public\s+function\s+rules\s*\(\s*\)\s*{([\s\S]*?)return\s*\[([\s\S]*?)\];/);
            if (rulesMethodMatch) {
                const rulesContent = rulesMethodMatch[2];
                request.fields = this.parseValidationRules(rulesContent);
            }

            this.requests.set(requestName, request);
        } catch (error) {
            console.error(`Error parsing request file ${filePath}:`, error);
        }
    }

    private parseValidationRules(rulesContent: string): RequestRule[] {
        const fields: RequestRule[] = [];
        
        // Match validation rules like 'field_name' => 'required|string|max:255'
        const rulePattern = /['"`]([^'"`]+)['"`]\s*=>\s*['"`]([^'"`]+)['"`]/g;
        let match;
        
        while ((match = rulePattern.exec(rulesContent)) !== null) {
            const fieldName = match[1];
            const rulesString = match[2];
            const rules = rulesString.split('|').map(rule => rule.trim());
            
            fields.push({
                field: fieldName,
                rules: rules
            });
        }

        // Also match array-style rules like 'field' => ['required', 'string']
        const arrayRulePattern = /['"`]([^'"`]+)['"`]\s*=>\s*\[([\s\S]*?)\]/g;
        while ((match = arrayRulePattern.exec(rulesContent)) !== null) {
            const fieldName = match[1];
            const arrayContent = match[2];
            const rules = this.extractArrayRules(arrayContent);
            
            fields.push({
                field: fieldName,
                rules: rules
            });
        }
        
        return fields;
    }

    private extractArrayRules(arrayContent: string): string[] {
        const rules: string[] = [];
        const rulePattern = /['"`]([^'"`]+)['"`]/g;
        let match;
        
        while ((match = rulePattern.exec(arrayContent)) !== null) {
            rules.push(match[1]);
        }
        
        return rules;
    }

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.CompletionItem[] {
        const lineText = document.lineAt(position).text;
        const beforeCursor = lineText.substring(0, position.character);
        
        // Check for model creation/update patterns with request fields
        const completions = this.provideRequestFieldCompletion(beforeCursor, document, position);
        if (completions.length > 0) {
            return completions;
        }
        
        return [];
    }

    private provideRequestFieldCompletion(
        beforeCursor: string,
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const patterns = [
            // Model::create([
            /(\w+)::create\s*\(\s*\[\s*$/,
            // $model->update([
            /\$\w+->update\s*\(\s*\[\s*$/,
            // $model->fill([
            /\$\w+->fill\s*\(\s*\[\s*$/,
            // new Model([
            /new\s+\w+\s*\(\s*\[\s*$/
        ];

        for (const pattern of patterns) {
            if (pattern.test(beforeCursor)) {
                const requestType = this.inferRequestTypeFromMethod(document, position);
                if (requestType) {
                    return this.getRequestFieldCompletions(requestType);
                }
            }
        }

        return [];
    }

    private inferRequestTypeFromMethod(document: vscode.TextDocument, position: vscode.Position): string | null {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Look backwards for method signature to find request parameter
        for (let i = position.line; i >= 0; i--) {
            const line = lines[i];
            
            // Look for method parameters with Request types
            const methodMatch = line.match(/function\s+\w+\s*\([^)]*(\w+Request)\s+\$\w+/);
            if (methodMatch) {
                return methodMatch[1];
            }
            
            // Look for public function declaration
            if (line.includes('public function') || line.includes('private function') || line.includes('protected function')) {
                break;
            }
        }
        
        return null;
    }

    private getRequestFieldCompletions(requestType: string): vscode.CompletionItem[] {
        const request = this.requests.get(requestType);
        if (!request) return [];

        const completions: vscode.CompletionItem[] = [];

        // Add individual field completions
        request.fields.forEach(field => {
            const item = new vscode.CompletionItem(`'${field.field}'`, vscode.CompletionItemKind.Field);
            item.detail = field.rules.join(' | ');
            item.documentation = new vscode.MarkdownString(
                `**Field:** ${field.field}\n\n` +
                `**Validation Rules:**\n${field.rules.map(rule => `- ${rule}`).join('\n')}`
            );
            
            // Insert the field name with quotes and arrow
            item.insertText = `'${field.field}' => `;
            item.command = {
                command: 'editor.action.triggerSuggest',
                title: 'Suggest'
            };
            
            completions.push(item);
        });

        // Add "Add All Request Fields" option
        if (request.fields.length > 0) {
            const addAllItem = new vscode.CompletionItem(
                `🔧 Add ALL Request Fields (${request.fields.length} fields)`,
                vscode.CompletionItemKind.Snippet
            );
            
            addAllItem.detail = `Insert all ${request.fields.length} fields from ${requestType}`;
            addAllItem.documentation = new vscode.MarkdownString(
                `**Fields to be added:**\n${request.fields.map(f => `- ${f.field}`).join('\n')}`
            );
            
            // Create snippet text for all fields
            const snippetText = request.fields.map((field, index) => {
                return `'${field.field}' => \${index + 1}`;
            }).join(',\n    ');
            
            addAllItem.insertText = new vscode.SnippetString(snippetText);
            addAllItem.sortText = '0'; // Make it appear first
            
            completions.unshift(addAllItem);
        }

        return completions;
    }

    // Command to manually trigger "Add All Fields"
    public addAllRequestFields(editor: vscode.TextEditor, requestType: string) {
        const request = this.requests.get(requestType);
        if (!request || request.fields.length === 0) {
            vscode.window.showWarningMessage(`No fields found for ${requestType}`);
            return;
        }

        const position = editor.selection.active;
        const indent = this.getIndentation(editor.document, position);
        
        const fieldsText = request.fields.map(field => {
            return `${indent}'${field.field}' => $request->get('${field.field}')`;
        }).join(',\n');

        editor.edit(editBuilder => {
            editBuilder.insert(position, fieldsText);
        });

        vscode.window.showInformationMessage(
            `Added ${request.fields.length} fields from ${requestType}`
        );
    }

    private getIndentation(document: vscode.TextDocument, position: vscode.Position): string {
        const line = document.lineAt(position).text;
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    // Get request info for external use
    public getRequest(name: string): RequestInfo | undefined {
        return this.requests.get(name);
    }

    public getAllRequests(): RequestInfo[] {
        return Array.from(this.requests.values());
    }
}

// Enhanced Model Completion Provider with Request Integration
export class EnhancedModelCompletionProvider implements vscode.CompletionItemProvider {
    constructor(
        private modelProvider: any, // LaravelIntelligentCompletionProvider
        private requestProvider: LaravelRequestCompletionProvider
    ) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.CompletionItem[] {
        const lineText = document.lineAt(position).text;
        const beforeCursor = lineText.substring(0, position.character);
        
        // First try request field completion
        const requestCompletions = this.requestProvider.provideCompletionItems(
            document, position, token, context
        );
        if (requestCompletions.length > 0) {
            return requestCompletions;
        }
        
        // Then try model attribute completion
        if (this.modelProvider) {
            return this.modelProvider.provideCompletionItems(
                document, position, token, context
            );
        }
        
        return [];
    }
}

// Code Actions for Request Fields
export class RequestFieldCodeActionProvider implements vscode.CodeActionProvider {
    constructor(private requestProvider: LaravelRequestCompletionProvider) {}

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];
        
        const lineText = document.lineAt(range.start.line).text;
        
        // Check if we're in a model creation/update context
        const patterns = [
            /(\w+)::create\s*\(\s*\[\s*$/,
            /\$\w+->update\s*\(\s*\[\s*$/,
            /\$\w+->fill\s*\(\s*\[\s*$/,
            /new\s+\w+\s*\(\s*\[\s*$/
        ];

        const isInModelContext = patterns.some(pattern => pattern.test(lineText));
        
        if (isInModelContext) {
            const requestType = this.inferRequestType(document, range.start);
            if (requestType) {
                const request = this.requestProvider.getRequest(requestType);
                if (request && request.fields.length > 0) {
                    const action = new vscode.CodeAction(
                        `Add all ${request.fields.length} fields from ${requestType}`,
                        vscode.CodeActionKind.Refactor
                    );
                    
                    action.command = {
                        command: 'laravel.addAllRequestFields',
                        title: 'Add All Request Fields',
                        arguments: [requestType]
                    };
                    
                    actions.push(action);
                }
            }
        }
        
        return actions;
    }

    private inferRequestType(document: vscode.TextDocument, position: vscode.Position): string | null {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Look backwards for method signature
        for (let i = position.line; i >= 0; i--) {
            const line = lines[i];
            const methodMatch = line.match(/function\s+\w+\s*\([^)]*(\w+Request)\s+\$\w+/);
            if (methodMatch) {
                return methodMatch[1];
            }
            
            if (line.includes('public function') || line.includes('private function') || line.includes('protected function')) {
                break;
            }
        }
        
        return null;
    }
}

// Commands for Request Field Management
export class RequestFieldCommands {
    static register(context: vscode.ExtensionContext, requestProvider: LaravelRequestCompletionProvider) {
        // Add all request fields command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.addAllRequestFields', (requestType: string) => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    requestProvider.addAllRequestFields(editor, requestType);
                }
            })
        );

        // Show request fields command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.showRequestFields', async () => {
                const requests = requestProvider.getAllRequests();
                if (requests.length === 0) {
                    vscode.window.showInformationMessage('No FormRequest classes found');
                    return;
                }

                const items = requests.map(request => ({
                    label: request.name,
                    description: `${request.fields.length} fields`,
                    detail: request.fields.map(f => f.field).join(', '),
                    request: request
                }));

                const selection = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select a FormRequest to view its fields'
                });

                if (selection) {
                    this.showRequestFieldsPanel(selection.request);
                }
            })
        );

        // Generate request from model command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.generateRequestFromModel', async () => {
                const modelName = await vscode.window.showInputBox({
                    prompt: 'Enter model name to generate FormRequest',
                    placeHolder: 'User'
                });

                if (modelName) {
                    await this.generateRequestFromModel(modelName);
                }
            })
        );
    }

    private static showRequestFieldsPanel(request: RequestInfo) {
        const panel = vscode.window.createWebviewPanel(
            'requestFields',
            `${request.name} Fields`,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.generateRequestFieldsHtml(request);
    }

    private static generateRequestFieldsHtml(request: RequestInfo): string {
        const fieldsTable = request.fields.map(field => `
            <tr>
                <td><code>${field.field}</code></td>
                <td>${field.rules.map(rule => `<span class="rule">${rule}</span>`).join(' ')}</td>
            </tr>
        `).join('');

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background-color: #f2f2f2; font-weight: bold; }
                    code { background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
                    .rule { background-color: #e3f2fd; padding: 2px 6px; border-radius: 3px; margin-right: 4px; font-size: 0.9em; }
                    .header { margin-bottom: 20px; }
                    .count { color: #666; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${request.name}</h1>
                    <p class="count">${request.fields.length} validation fields</p>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Field Name</th>
                            <th>Validation Rules</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${fieldsTable}
                    </tbody>
                </table>
            </body>
            </html>
        `;
    }

    private static async generateRequestFromModel(modelName: string) {
        // This would generate a FormRequest class based on model attributes
        vscode.window.showInformationMessage(
            `Feature coming soon: Generate ${modelName}Request from ${modelName} model`
        );
    }
}