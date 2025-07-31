"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedTranslationCommands = exports.TranslationCodeActionProvider = exports.TranslationDiagnosticsProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
class TranslationDiagnosticsProvider {
    constructor(translationProvider, workspaceRoot) {
        this.translationProvider = translationProvider;
        this.workspaceRoot = workspaceRoot;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('laravel-translations');
        this.setupEventListeners();
    }
    setupEventListeners() {
        // Update diagnostics when files change
        vscode.workspace.onDidChangeTextDocument(e => {
            if (this.isRelevantFile(e.document)) {
                this.updateDiagnostics(e.document);
            }
        });
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (this.isRelevantFile(doc)) {
                this.updateDiagnostics(doc);
            }
        });
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && this.isRelevantFile(editor.document)) {
                this.updateDiagnostics(editor.document);
            }
        });
    }
    isRelevantFile(document) {
        return document.fileName.endsWith('.php') ||
            document.fileName.endsWith('.blade.php');
    }
    updateDiagnostics(document) {
        const diagnostics = [];
        const text = document.getText();
        // Find all translation calls
        const translationCalls = this.findTranslationCalls(text);
        translationCalls.forEach(call => {
            const translation = this.translationProvider.getTranslation(call.key);
            if (!translation) {
                // Missing translation
                const diagnostic = new vscode.Diagnostic(call.range, `Translation key '${call.key}' not found`, vscode.DiagnosticSeverity.Warning);
                diagnostic.code = 'missing-translation';
                diagnostic.source = 'Laravel Translations';
                diagnostics.push(diagnostic);
            }
            else {
                // Check for incomplete translations (missing locales)
                const availableLocales = this.translationProvider.getLocales();
                const translationLocales = this.translationProvider
                    .getAllTranslations()
                    .get(call.key)
                    ?.map(t => t.locale) || [];
                const missingLocales = availableLocales.filter(locale => !translationLocales.includes(locale));
                if (missingLocales.length > 0) {
                    const diagnostic = new vscode.Diagnostic(call.range, `Translation '${call.key}' missing in locales: ${missingLocales.join(', ')}`, vscode.DiagnosticSeverity.Information);
                    diagnostic.code = 'incomplete-translation';
                    diagnostic.source = 'Laravel Translations';
                    diagnostics.push(diagnostic);
                }
            }
        });
        this.diagnosticCollection.set(document.uri, diagnostics);
    }
    findTranslationCalls(text) {
        const calls = [];
        const lines = text.split('\n');
        const patterns = [
            { regex: /trans\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'trans' },
            { regex: /__\s*\(\s*['"`]([^'"`]+)['"`]/g, method: '__' },
            { regex: /trans_choice\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'trans_choice' },
            { regex: /@lang\s*\(\s*['"`]([^'"`]+)['"`]/g, method: '@lang' },
            { regex: /\{\{\s*trans\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'trans' },
            { regex: /\{\{\s*__\s*\(\s*['"`]([^'"`]+)['"`]/g, method: '__' }
        ];
        patterns.forEach(({ regex, method }) => {
            let match;
            while ((match = regex.exec(text)) !== null) {
                const key = match[1];
                const startPos = this.getPositionFromIndex(text, match.index);
                const endPos = this.getPositionFromIndex(text, match.index + match[0].length);
                calls.push({
                    key,
                    method,
                    range: new vscode.Range(startPos, endPos),
                    match: match[0]
                });
            }
        });
        return calls;
    }
    getPositionFromIndex(text, index) {
        const beforeIndex = text.substring(0, index);
        const lines = beforeIndex.split('\n');
        return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
    }
    dispose() {
        this.diagnosticCollection.dispose();
    }
}
exports.TranslationDiagnosticsProvider = TranslationDiagnosticsProvider;
// Code Action Provider for translation fixes
class TranslationCodeActionProvider {
    constructor(translationProvider, workspaceRoot) {
        this.translationProvider = translationProvider;
        this.workspaceRoot = workspaceRoot;
    }
    provideCodeActions(document, range, context) {
        const actions = [];
        context.diagnostics.forEach(diagnostic => {
            if (diagnostic.source === 'Laravel Translations') {
                if (diagnostic.code === 'missing-translation') {
                    actions.push(this.createAddTranslationAction(document, diagnostic));
                    actions.push(this.createAddAllLocalesAction(document, diagnostic));
                }
                if (diagnostic.code === 'incomplete-translation') {
                    actions.push(this.createCompleteTranslationAction(document, diagnostic));
                }
            }
        });
        return actions;
    }
    createAddTranslationAction(document, diagnostic) {
        const action = new vscode.CodeAction('Add translation key to default locale', vscode.CodeActionKind.QuickFix);
        const key = this.extractKeyFromDiagnostic(diagnostic.message);
        action.edit = new vscode.WorkspaceEdit();
        action.command = {
            command: 'laravel.addTranslationKey',
            title: 'Add Translation Key',
            arguments: [key, 'en', '']
        };
        return action;
    }
    createAddAllLocalesAction(document, diagnostic) {
        const action = new vscode.CodeAction('Add translation key to all locales', vscode.CodeActionKind.QuickFix);
        const key = this.extractKeyFromDiagnostic(diagnostic.message);
        action.command = {
            command: 'laravel.addTranslationKeyAllLocales',
            title: 'Add Translation Key to All Locales',
            arguments: [key]
        };
        return action;
    }
    createCompleteTranslationAction(document, diagnostic) {
        const action = new vscode.CodeAction('Complete translation for missing locales', vscode.CodeActionKind.QuickFix);
        const key = this.extractKeyFromDiagnostic(diagnostic.message);
        action.command = {
            command: 'laravel.completeTranslation',
            title: 'Complete Translation',
            arguments: [key]
        };
        return action;
    }
    extractKeyFromDiagnostic(message) {
        const match = message.match(/'([^']+)'/);
        return match ? match[1] : '';
    }
}
exports.TranslationCodeActionProvider = TranslationCodeActionProvider;
// Enhanced Translation Commands with file modification capabilities
class EnhancedTranslationCommands {
    static register(context, translationProvider, workspaceRoot) {
        // Add translation key to specific locale
        context.subscriptions.push(vscode.commands.registerCommand('laravel.addTranslationKey', async (key, locale, value) => {
            if (!value) {
                value = await vscode.window.showInputBox({
                    prompt: `Enter translation value for '${key}' in ${locale}`,
                    placeHolder: 'Translation value'
                });
                if (!value)
                    return;
            }
            await this.addTranslationToFile(workspaceRoot, key, locale, value);
            vscode.window.showInformationMessage(`Translation '${key}' added to ${locale} locale`);
        }));
        // Add translation key to all locales
        context.subscriptions.push(vscode.commands.registerCommand('laravel.addTranslationKeyAllLocales', async (key) => {
            const locales = translationProvider.getLocales();
            for (const locale of locales) {
                const value = await vscode.window.showInputBox({
                    prompt: `Enter translation value for '${key}' in ${locale}`,
                    placeHolder: `Translation value for ${locale}`
                });
                if (value) {
                    await this.addTranslationToFile(workspaceRoot, key, locale, value);
                }
            }
            vscode.window.showInformationMessage(`Translation '${key}' added to all locales`);
        }));
        // Complete missing translations
        context.subscriptions.push(vscode.commands.registerCommand('laravel.completeTranslation', async (key) => {
            const allLocales = translationProvider.getLocales();
            const existingTranslations = translationProvider.getAllTranslations().get(key) || [];
            const existingLocales = existingTranslations.map(t => t.locale);
            const missingLocales = allLocales.filter(locale => !existingLocales.includes(locale));
            for (const locale of missingLocales) {
                const value = await vscode.window.showInputBox({
                    prompt: `Enter translation value for '${key}' in ${locale}`,
                    placeHolder: `Translation value for ${locale}`
                });
                if (value) {
                    await this.addTranslationToFile(workspaceRoot, key, locale, value);
                }
            }
            vscode.window.showInformationMessage(`Completed translations for '${key}'`);
        }));
        // Generate translation report
        context.subscriptions.push(vscode.commands.registerCommand('laravel.generateTranslationReport', () => {
            this.generateTranslationReport(translationProvider);
        }));
        // Export translations to CSV
        context.subscriptions.push(vscode.commands.registerCommand('laravel.exportTranslations', async () => {
            await this.exportTranslationsToCSV(translationProvider, workspaceRoot);
        }));
    }
    static async addTranslationToFile(workspaceRoot, key, locale, value) {
        const keyParts = key.split('.');
        const namespace = keyParts[0];
        const translationKey = keyParts.slice(1).join('.');
        // Determine file path
        const possiblePaths = [
            path.join(workspaceRoot, 'lang', locale, `${namespace}.php`),
            path.join(workspaceRoot, 'resources', 'lang', locale, `${namespace}.php`)
        ];
        let filePath = possiblePaths.find(p => fs.existsSync(path.dirname(p)));
        if (!filePath) {
            filePath = possiblePaths[0]; // Default to first option
            // Create directory if it doesn't exist
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        // Create or update translation file
        if (!fs.existsSync(filePath)) {
            // Create new file
            const content = `<?php\n\nreturn [\n    '${translationKey}' => '${value}',\n];\n`;
            fs.writeFileSync(filePath, content);
        }
        else {
            // Update existing file
            let content = fs.readFileSync(filePath, 'utf8');
            // Find the return array and add new translation
            const returnMatch = content.match(/(return\s*\[)([\s\S]*?)(\];)/);
            if (returnMatch) {
                const before = returnMatch[1];
                const arrayContent = returnMatch[2];
                const after = returnMatch[3];
                // Add new translation
                const newEntry = `    '${translationKey}' => '${value}',\n`;
                const updatedContent = before + arrayContent + newEntry + after;
                fs.writeFileSync(filePath, updatedContent);
            }
        }
    }
    static generateTranslationReport(translationProvider) {
        const unused = translationProvider.getUnusedTranslations();
        const missing = translationProvider.getMissingTranslations();
        const allTranslations = translationProvider.getAllTranslations();
        const panel = vscode.window.createWebviewPanel('translationReport', 'Translation Report', vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = this.generateReportHtml(unused, missing, allTranslations);
    }
    static generateReportHtml(unused, missing, allTranslations) {
        const totalKeys = allTranslations.size;
        const usedKeys = totalKeys - unused.length;
        const usagePercentage = totalKeys > 0 ? ((usedKeys / totalKeys) * 100).toFixed(1) : 0;
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
                    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                    .stat { display: inline-block; margin-right: 30px; }
                    .stat-number { font-size: 24px; font-weight: bold; color: #007acc; }
                    .stat-label { font-size: 12px; color: #666; }
                    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    .section-title { font-size: 18px; font-weight: bold; margin-top: 30px; margin-bottom: 10px; }
                    .warning { color: #d73a49; }
                    .success { color: #28a745; }
                </style>
            </head>
            <body>
                <h1>Laravel Translation Report</h1>
                
                <div class="summary">
                    <div class="stat">
                        <div class="stat-number">${totalKeys}</div>
                        <div class="stat-label">Total Keys</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">${usedKeys}</div>
                        <div class="stat-label">Used Keys</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">${unused.length}</div>
                        <div class="stat-label">Unused Keys</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">${missing.length}</div>
                        <div class="stat-label">Missing Keys</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">${usagePercentage}%</div>
                        <div class="stat-label">Usage Rate</div>
                    </div>
                </div>

                <div class="section-title warning">Missing Translations (${missing.length})</div>
                ${missing.length > 0 ? `
                    <table>
                        <tr><th>Key</th></tr>
                        ${missing.map(key => `<tr><td>${key}</td></tr>`).join('')}
                    </table>
                ` : '<p class="success">No missing translations found!</p>'}

                <div class="section-title warning">Unused Translations (${unused.length})</div>
                ${unused.length > 0 ? `
                    <table>
                        <tr><th>Key</th><th>Locale</th><th>Value</th><th>File</th></tr>
                        ${unused.map(t => `
                            <tr>
                                <td>${t.key}</td>
                                <td>${t.locale}</td>
                                <td>${t.value}</td>
                                <td>${path.basename(t.file)}</td>
                            </tr>
                        `).join('')}
                    </table>
                ` : '<p class="success">No unused translations found!</p>'}
            </body>
            </html>
        `;
    }
    static async exportTranslationsToCSV(translationProvider, workspaceRoot) {
        const allTranslations = translationProvider.getAllTranslations();
        const locales = translationProvider.getLocales();
        // Create CSV content
        const csvLines = [];
        csvLines.push(['Key', ...locales, 'Used'].join(','));
        allTranslations.forEach((translations, key) => {
            const row = [key];
            // Add values for each locale
            locales.forEach(locale => {
                const translation = translations.find(t => t.locale === locale);
                row.push(translation ? `"${translation.value.replace(/"/g, '""')}"` : '');
            });
            // Add usage status
            row.push(translations.some(t => t.isUsed) ? 'Yes' : 'No');
            csvLines.push(row.join(','));
        });
        // Save to file
        const csvContent = csvLines.join('\n');
        const filePath = path.join(workspaceRoot, 'translations-export.csv');
        fs.writeFileSync(filePath, csvContent);
        vscode.window.showInformationMessage(`Translations exported to ${filePath}`, 'Open File').then(selection => {
            if (selection === 'Open File') {
                vscode.workspace.openTextDocument(filePath).then(doc => {
                    vscode.window.showTextDocument(doc);
                });
            }
        });
    }
}
exports.EnhancedTranslationCommands = EnhancedTranslationCommands;
//# sourceMappingURL=translationDiagnostics.js.map