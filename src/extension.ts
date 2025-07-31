import * as vscode from 'vscode';
import { LaravelDetector } from './utils/laravelDetector';
import { ArtisanCommands } from './commands/artisanCommands';
import { BladeCompletionProvider } from './providers/bladeCompletionProvider';
import { 
    TranslationProvider, 
    TranslationCompletionProvider, 
    TranslationHoverProvider,
    TranslationCommands 
} from './providers/translationProvider';
import {
    EnhancedRouteInlayProvider,
    EnhancedControllerCodeLensProvider,
    RouteHoverProvider,
    RouteCommands
} from './providers/enhancedRouteInlayProvider';
import { 
    LaravelIntelligentCompletionProvider 
} from './providers/intelligentCompletionProvider';
import { 
    LaravelRequestCompletionProvider,
    EnhancedModelCompletionProvider,
    RequestFieldCodeActionProvider,
    RequestFieldCommands
} from './providers/requestCompletionProvider';
import {
    LaravelValidationCompletionProvider
} from './providers/validationCompletionProvider';
import {
    ValidationHoverProvider,
    ValidationDiagnosticsProvider,
    ValidationCodeActionProvider,
    ValidationCommands
} from './providers/validationHoverProvider';
import { SettingsCommands } from './commands/settingsCommands';
import { ConfigCompletionProvider } from './providers/configCompletionProvider';
import { LaravelDefinitionProvider } from './providers/definitionProvider';

let definitionProvider: LaravelDefinitionProvider | undefined;
let configCompletionProvider: ConfigCompletionProvider | undefined;
let translationProvider: TranslationProvider | undefined;
let routeInlayProvider: EnhancedRouteInlayProvider | undefined;
let intelligentCompletionProvider: LaravelIntelligentCompletionProvider | undefined;
let requestCompletionProvider: LaravelRequestCompletionProvider | undefined;
let validationCompletionProvider: LaravelValidationCompletionProvider | undefined;
let validationDiagnosticsProvider: ValidationDiagnosticsProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder || !LaravelDetector.isLaravelProject(workspaceFolder.uri.fsPath)) {
        return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;

    // Initialize all providers
    configCompletionProvider = new ConfigCompletionProvider(workspaceRoot);
    translationProvider = new TranslationProvider(workspaceRoot);
    routeInlayProvider = new EnhancedRouteInlayProvider(workspaceRoot);
    intelligentCompletionProvider = new LaravelIntelligentCompletionProvider(workspaceRoot);
    requestCompletionProvider = new LaravelRequestCompletionProvider(workspaceRoot);
    validationCompletionProvider = new LaravelValidationCompletionProvider(workspaceRoot);
    definitionProvider = new LaravelDefinitionProvider(
        workspaceRoot,
        configCompletionProvider,
        translationProvider
    );

    // Initialize validation diagnostics provider
    validationDiagnosticsProvider = new ValidationDiagnosticsProvider(validationCompletionProvider);
    
    // Create enhanced model completion provider
    const enhancedModelProvider = new EnhancedModelCompletionProvider(
        intelligentCompletionProvider,
        requestCompletionProvider
    );
    
    // Register commands
    ArtisanCommands.register(context);
    TranslationCommands.register(context, translationProvider);
    RouteCommands.register(context, routeInlayProvider);
    RequestFieldCommands.register(context, requestCompletionProvider);
    ValidationCommands.register(context, validationCompletionProvider);
    SettingsCommands.register(context);

    // Register completion providers
    context.subscriptions.push(
        // Blade completion
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'blade' },
            new BladeCompletionProvider(),
            '@'
        ),
        
        // Translation completion
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'php' },
            new TranslationCompletionProvider(translationProvider),
            '"', "'", '`'
        ),

        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', pattern: '**/*.blade.php' },
            new TranslationCompletionProvider(translationProvider),
            '"', "'", '`'
        ),
        
        // Enhanced model and request completion for PHP files
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'php' },
            enhancedModelProvider,
            '.', '>', '[', '"', "'", '$'
        ),
        
        // View name completion
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'php' },
            intelligentCompletionProvider,
            '"', "'", '('
        ),
        
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', pattern: '**/*.blade.php' },
            intelligentCompletionProvider,
            '"', "'", '('
        ),
        
        // Validation rules completion
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'php' },
            validationCompletionProvider,
            '"', "'", '|', ','
        ),

        // Config completion for PHP files
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'php' },
            configCompletionProvider,
            '"', "'", '('
        ),

        // Config completion for Blade files
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', pattern: '**/*.blade.php' },
            configCompletionProvider,
            '"', "'", '('
        ),

        // Definition provider for PHP files
        vscode.languages.registerDefinitionProvider(
            { scheme: 'file', language: 'php' },
            definitionProvider
        ),

        // Definition provider for Blade files
        vscode.languages.registerDefinitionProvider(
            { scheme: 'file', pattern: '**/*.blade.php' },
            definitionProvider
        )
    );
    
    // Register hover providers
    context.subscriptions.push(
        // Translation hover
        vscode.languages.registerHoverProvider(
            { scheme: 'file', language: 'php' },
            new TranslationHoverProvider(translationProvider)
        ),
        
        vscode.languages.registerHoverProvider(
            { scheme: 'file', pattern: '**/*.blade.php' },
            new TranslationHoverProvider(translationProvider)
        ),
        
        // Route hover
        vscode.languages.registerHoverProvider(
            { scheme: 'file', pattern: '**/routes/**/*.php' },
            new RouteHoverProvider(routeInlayProvider)
        ),
        
        // Validation rules hover
        vscode.languages.registerHoverProvider(
            { scheme: 'file', language: 'php' },
            new ValidationHoverProvider(validationCompletionProvider)
        )
    );
    
    // Register inlay hints provider for routes
    context.subscriptions.push(
        vscode.languages.registerInlayHintsProvider(
            { scheme: 'file', pattern: '**/routes/**/*.php' },
            routeInlayProvider
        )
    );
    
    // Register CodeLens provider for controllers
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { scheme: 'file', pattern: '**/*Controller.php' },
            new EnhancedControllerCodeLensProvider(routeInlayProvider)
        )
    );
    
    // Register code action providers
    context.subscriptions.push(
        // Request field code actions
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file', language: 'php' },
            new RequestFieldCodeActionProvider(requestCompletionProvider),
            {
                providedCodeActionKinds: [vscode.CodeActionKind.Refactor]
            }
        ),
        
        // Validation code actions
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file', language: 'php' },
            new ValidationCodeActionProvider(validationCompletionProvider),
            {
                providedCodeActionKinds: [
                    vscode.CodeActionKind.QuickFix,
                    vscode.CodeActionKind.Refactor,
                    vscode.CodeActionKind.SourceOrganizeImports
                ]
            }
        )
    );
    
    // Register diagnostic provider for missing translations
    const translationDiagnosticCollection = vscode.languages.createDiagnosticCollection('laravel-translations');
    context.subscriptions.push(translationDiagnosticCollection);
    
    // Set up diagnostics refresh
    const refreshDiagnostics = () => {
        if (vscode.window.activeTextEditor) {
            updateTranslationDiagnostics(vscode.window.activeTextEditor.document, translationDiagnosticCollection);
        }
    };
    
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(refreshDiagnostics),
        vscode.workspace.onDidChangeTextDocument(e => updateTranslationDiagnostics(e.document, translationDiagnosticCollection)),
        vscode.workspace.onDidOpenTextDocument(doc => updateTranslationDiagnostics(doc, translationDiagnosticCollection))
    );
    
    // Register status bar for Laravel project info
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(symbol-class) Laravel Enhanced";
    statusBarItem.tooltip = "Laravel Enhanced is active - Click for project info";
    statusBarItem.command = 'laravel.showProjectInfo';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    
    // Register project info command
    context.subscriptions.push(
        vscode.commands.registerCommand('laravel.showProjectInfo', () => {
            const models = intelligentCompletionProvider?.getAllModels() || [];
            const views = intelligentCompletionProvider?.getAllViews() || [];
            const routes = routeInlayProvider?.getAllRoutes() || [];
            const requests = requestCompletionProvider?.getAllRequests() || [];
            const validationRules = validationCompletionProvider?.getValidationRules() || [];
            const configKeys = configCompletionProvider?.getConfigKeysCount() || 0;
            const envKeys = configCompletionProvider?.getEnvKeysCount() || 0;
            
            const info = `🚀 Laravel Enhanced Project Information:
            
📊 Project Stats:
- Models: ${models.length}
- Views: ${views.length}  
- Routes: ${routes.length}
- Form Requests: ${requests.length}
- Validation Rules: ${validationRules.length}
- Config Keys: ${configKeys}
- Environment Variables: ${envKeys}

🎯 Available Features:
- Intelligent model attribute completion
- Request field auto-completion with "Add All Fields"
- Complete validation rules library with smart suggestions
- Route navigation and inlay hints
- Translation key management
- View name and variable completion
- Config and Environment variable completion

⌨️ Quick Commands:
- Laravel: Show All Routes (Ctrl+Shift+R)
- Laravel: Show Validation Rules
- Laravel: Show Request Fields
- Laravel: Show Unused Translations
- Laravel: Open Settings`;
            
            vscode.window.showInformationMessage(info, 
                'Show Routes', 
                'Show Validation Rules', 
                'Show Models',
                'Settings'
            ).then(selection => {
                switch (selection) {
                    case 'Show Routes':
                        vscode.commands.executeCommand('laravel.showAllRoutes');
                        break;
                    case 'Show Validation Rules':
                        vscode.commands.executeCommand('laravel.showValidationRules');
                        break;
                    case 'Show Models':
                        showModelsQuickPick(models);
                        break;
                    case 'Settings':
                        vscode.commands.executeCommand('laravel.openSettings');
                        break;
                }
            });
        })
    );

    // Register snippet for common validation patterns
    registerValidationSnippets(context);
    
    vscode.window.showInformationMessage('🚀 Laravel Enhanced with Full Intelligence & Validation activated!');
}

function updateTranslationDiagnostics(
    document: vscode.TextDocument, 
    collection: vscode.DiagnosticCollection
): void {
    if (!translationProvider) return;
    
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    
    // Find translation calls and check if keys exist
    const patterns = [
        { regex: /trans\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'trans' },
        { regex: /__\s*\(\s*['"`]([^'"`]+)['"`]/g, method: '__' },
        { regex: /trans_choice\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'trans_choice' },
        { regex: /@lang\s*\(\s*['"`]([^'"`]+)['"`]/g, method: '@lang' }
    ];
    
    patterns.forEach(({ regex, method }) => {
        let match;
        while ((match = regex.exec(text)) !== null) {
            const key = match[1];
            const translation = translationProvider!.getTranslation(key);
            
            if (!translation) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                const range = new vscode.Range(startPos, endPos);
                
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Translation key '${key}' not found`,
                    vscode.DiagnosticSeverity.Warning
                );
                
                diagnostic.code = 'missing-translation';
                diagnostic.source = 'Laravel Enhanced';
                
                diagnostics.push(diagnostic);
            }
        }
    });
    
    collection.set(document.uri, diagnostics);
}

function showModelsQuickPick(models: any[]) {
    const items = models.map(model => ({
        label: `$(symbol-class) ${model.name}`,
        description: `${model.fields.length} fields, ${model.relationships.length} relationships`,
        detail: model.fields.slice(0, 5).map((f: any) => f.name).join(', ') + 
               (model.fields.length > 5 ? '...' : ''),
        model: model
    }));

    vscode.window.showQuickPick(items, {
        placeHolder: 'Select a model to view its details',
        matchOnDescription: true,
        matchOnDetail: true
    }).then(selection => {
        if (selection) {
            showModelDetailsPanel(selection.model);
        }
    });
}

function showModelDetailsPanel(model: any) {
    const panel = vscode.window.createWebviewPanel(
        'modelDetails',
        `${model.name} Model`,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const fieldsTable = model.fields.map((field: any) => `
        <tr>
            <td><code>${field.name}</code></td>
            <td><span class="type ${field.type}">${field.type}</span></td>
            <td>${field.nullable ? '✓' : '✗'}</td>
            <td>${field.default || '-'}</td>
        </tr>
    `).join('');

    const relationshipsTable = model.relationships.map((rel: any) => `
        <tr>
            <td><code>${rel.name}</code></td>
            <td><span class="rel-type ${rel.type}">${rel.type}</span></td>
            <td>${rel.relatedModel}</td>
        </tr>
    `).join('');

    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    padding: 20px; 
                    background: #f8f9fa;
                }
                .container { 
                    max-width: 1200px; 
                    margin: 0 auto; 
                    background: white; 
                    border-radius: 8px; 
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
                    overflow: hidden;
                }
                .header { 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 30px; 
                    text-align: center;
                }
                .header h1 { 
                    margin: 0; 
                    font-size: 2em; 
                    font-weight: 300;
                }
                .header p { 
                    margin: 10px 0 0 0; 
                    opacity: 0.9; 
                }
                .content { 
                    padding: 30px; 
                }
                table { 
                    border-collapse: collapse; 
                    width: 100%; 
                    margin-bottom: 30px; 
                    border-radius: 6px; 
                    overflow: hidden; 
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                th, td { 
                    padding: 12px 15px; 
                    text-align: left; 
                    border-bottom: 1px solid #eee;
                }
                th { 
                    background: #f8f9fa; 
                    font-weight: 600; 
                    color: #495057;
                    font-size: 0.9em;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                tr:hover { 
                    background: #f8f9fa; 
                }
                code { 
                    background: #e9ecef; 
                    padding: 4px 8px; 
                    border-radius: 4px; 
                    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
                    font-size: 0.9em;
                }
                .type { 
                    padding: 4px 8px; 
                    border-radius: 4px; 
                    font-size: 0.8em; 
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .type.string { background: #d4edda; color: #155724; }
                .type.integer { background: #cce5ff; color: #004085; }
                .type.boolean { background: #fff3cd; color: #856404; }
                .type.datetime, .type.timestamp { background: #f8d7da; color: #721c24; }
                .type.decimal, .type.float { background: #e2e3e5; color: #383d41; }
                .rel-type { 
                    background: #e3f2fd; 
                    color: #1565c0; 
                    padding: 4px 8px; 
                    border-radius: 4px; 
                    font-size: 0.8em; 
                    font-weight: 600;
                }
                .table-title { 
                    font-size: 1.4em; 
                    font-weight: 600; 
                    margin-bottom: 15px; 
                    color: #495057;
                    display: flex;
                    align-items: center;
                }
                .table-title::before {
                    content: "📊";
                    margin-right: 10px;
                    font-size: 1.2em;
                }
                .stats { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                    gap: 20px; 
                    margin-bottom: 30px;
                }
                .stat-card { 
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); 
                    color: white; 
                    padding: 20px; 
                    border-radius: 8px; 
                    text-align: center;
                }
                .stat-number { 
                    font-size: 2em; 
                    font-weight: bold; 
                    margin-bottom: 5px;
                }
                .stat-label { 
                    font-size: 0.9em; 
                    opacity: 0.9;
                }
                .empty-state {
                    text-align: center;
                    padding: 40px;
                    color: #6c757d;
                    font-style: italic;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>${model.name}</h1>
                    <p><strong>Table:</strong> ${model.table} | <strong>File:</strong> ${model.filePath.split('/').pop()}</p>
                </div>
                
                <div class="content">
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-number">${model.fields.length}</div>
                            <div class="stat-label">Database Fields</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${model.relationships.length}</div>
                            <div class="stat-label">Relationships</div>
                        </div>
                    </div>
                    
                    <div class="table-title">Database Fields</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Field Name</th>
                                <th>Type</th>
                                <th>Nullable</th>
                                <th>Default</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${fieldsTable}
                        </tbody>
                    </table>
                    
                    ${model.relationships.length > 0 ? `
                        <div class="table-title">Relationships</div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Method Name</th>
                                    <th>Relationship Type</th>
                                    <th>Related Model</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${relationshipsTable}
                            </tbody>
                        </table>
                    ` : '<div class="empty-state">🔗 No relationships defined</div>'}
                </div>
            </div>
        </body>
        </html>
    `;
}

function registerValidationSnippets(context: vscode.ExtensionContext) {
    // Register common validation rule snippets
    const snippets = [
        {
            name: "Laravel Email Validation",
            prefix: "val-email",
            body: "'${1:email}' => 'required|string|email|max:255'",
            description: "Email field validation"
        },
        {
            name: "Laravel Password Validation",
            prefix: "val-password",
            body: "'${1:password}' => 'required|string|min:8|confirmed'",
            description: "Password field validation with confirmation"
        },
        {
            name: "Laravel Name Validation",
            prefix: "val-name",
            body: "'${1:name}' => 'required|string|max:255'",
            description: "Name field validation"
        },
        {
            name: "Laravel ID Validation",
            prefix: "val-id",
            body: "'${1:user_id}' => 'required|integer|exists:${2:users},id'",
            description: "Foreign key validation"
        },
        {
            name: "Laravel Image Validation",
            prefix: "val-image",
            body: "'${1:image}' => 'required|image|max:2048'",
            description: "Image upload validation"
        },
        {
            name: "Laravel File Validation",
            prefix: "val-file",
            body: "'${1:file}' => 'required|file|max:10240|mimes:${2:pdf,doc,docx}'",
            description: "File upload validation"
        },
        {
            name: "Laravel Phone Validation",
            prefix: "val-phone",
            body: "'${1:phone}' => 'required|string|regex:/^\\\\+?[1-9]\\\\d{1,14}$/'",
            description: "Phone number validation"
        },
        {
            name: "Laravel URL Validation",
            prefix: "val-url",
            body: "'${1:website}' => 'required|string|url'",
            description: "URL validation"
        },
        {
            name: "Laravel Date Validation",
            prefix: "val-date",
            body: "'${1:birth_date}' => 'required|date|before:today'",
            description: "Date validation"
        },
        {
            name: "Laravel Boolean Validation",
            prefix: "val-bool",
            body: "'${1:is_active}' => 'boolean'",
            description: "Boolean validation"
        }
    ];

    // Register each snippet
    snippets.forEach(snippet => {
        const disposable = vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'php' },
            {
                provideCompletionItems() {
                    const completionItem = new vscode.CompletionItem(snippet.prefix, vscode.CompletionItemKind.Snippet);
                    completionItem.insertText = new vscode.SnippetString(snippet.body);
                    completionItem.documentation = snippet.description;
                    completionItem.detail = snippet.name;
                    return [completionItem];
                }
            }
        );
        context.subscriptions.push(disposable);
    });
}

export function deactivate() {
    if (translationProvider) {
        translationProvider.dispose();
    }
    if (validationDiagnosticsProvider) {
        validationDiagnosticsProvider.dispose();
    }
}