"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationCommands = exports.ValidationCodeActionProvider = exports.ValidationDiagnosticsProvider = exports.ValidationHoverProvider = void 0;
const vscode = require("vscode");
class ValidationHoverProvider {
    constructor(validationProvider) {
        this.validationProvider = validationProvider;
    }
    provideHover(document, position, token) {
        const range = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_:]*/);
        if (!range)
            return undefined;
        const text = document.getText(range);
        const line = document.lineAt(position).text;
        // Check if we're hovering over a validation rule
        if (this.isValidationRule(text, line)) {
            const rule = this.validationProvider.getValidationRule(text.split(':')[0]);
            if (rule) {
                return new vscode.Hover(this.createRuleHoverContent(rule, text), range);
            }
        }
        return undefined;
    }
    isValidationRule(text, line) {
        // Check if we're in a validation context
        const validationPatterns = [
            /['"`][^'"`]*['"`]\s*=>\s*['"`][^'"`]*$/,
            /['"`][^'"`]*['"`]\s*=>\s*\[[^\]]*$/,
            /'[^']*'\s*,?\s*$/,
            /"[^"]*"\s*,?\s*$/
        ];
        return validationPatterns.some(pattern => pattern.test(line));
    }
    createRuleHoverContent(rule, fullText) {
        const content = new vscode.MarkdownString();
        content.appendMarkdown(`## ${rule.name}\n\n`);
        content.appendMarkdown(`**Category:** ${rule.category}\n\n`);
        content.appendMarkdown(`${rule.description}\n\n`);
        // Parse parameters from the actual rule text
        const params = this.extractRuleParameters(fullText);
        if (params.length > 0 && rule.parameters) {
            content.appendMarkdown(`**Parameters:**\n`);
            params.forEach((param, index) => {
                const paramDef = rule.parameters[index];
                if (paramDef) {
                    content.appendMarkdown(`- \`${param}\` - ${paramDef.description}\n`);
                }
            });
            content.appendMarkdown(`\n`);
        }
        content.appendMarkdown(`**Examples:**\n`);
        rule.examples.forEach(example => {
            content.appendMarkdown(`- \`${example}\`\n`);
        });
        if (rule.phpDocUrl) {
            content.appendMarkdown(`\n[📖 View Documentation](${rule.phpDocUrl})`);
        }
        content.isTrusted = true;
        return content;
    }
    extractRuleParameters(ruleText) {
        const colonIndex = ruleText.indexOf(':');
        if (colonIndex === -1)
            return [];
        const paramsString = ruleText.substring(colonIndex + 1);
        return paramsString.split(',').map(param => param.trim());
    }
}
exports.ValidationHoverProvider = ValidationHoverProvider;
// Validation diagnostics provider
class ValidationDiagnosticsProvider {
    constructor(validationProvider) {
        this.validationProvider = validationProvider;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('laravel-validation');
        this.setupEventListeners();
    }
    setupEventListeners() {
        vscode.workspace.onDidChangeTextDocument(e => {
            if (this.isValidationFile(e.document)) {
                this.updateDiagnostics(e.document);
            }
        });
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (this.isValidationFile(doc)) {
                this.updateDiagnostics(doc);
            }
        });
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && this.isValidationFile(editor.document)) {
                this.updateDiagnostics(editor.document);
            }
        });
    }
    isValidationFile(document) {
        return document.fileName.endsWith('.php') &&
            (document.fileName.includes('Request') ||
                document.getText().includes('rules()') ||
                document.getText().includes('Validator::make'));
    }
    updateDiagnostics(document) {
        const diagnostics = [];
        const text = document.getText();
        const lines = text.split('\n');
        lines.forEach((line, lineIndex) => {
            const validationRules = this.extractValidationRulesFromLine(line);
            validationRules.forEach(({ rule, range }) => {
                const issues = this.validateRule(rule, document, lineIndex);
                issues.forEach(issue => {
                    const diagnostic = new vscode.Diagnostic(new vscode.Range(lineIndex, range.start, lineIndex, range.end), issue.message, issue.severity);
                    diagnostic.source = 'Laravel Validation';
                    diagnostic.code = issue.code;
                    diagnostics.push(diagnostic);
                });
            });
        });
        this.diagnosticCollection.set(document.uri, diagnostics);
    }
    extractValidationRulesFromLine(line) {
        const rules = [];
        // Pattern for pipe-separated rules: 'required|string|max:255'
        const pipeRuleMatch = line.match(/['"`]([^'"`]+)['"`]/);
        if (pipeRuleMatch && pipeRuleMatch[1].includes('|')) {
            const rulesString = pipeRuleMatch[1];
            const rulesList = rulesString.split('|');
            let currentPos = line.indexOf(rulesString);
            rulesList.forEach(rule => {
                const start = currentPos;
                const end = currentPos + rule.length;
                rules.push({ rule: rule.trim(), range: { start, end } });
                currentPos += rule.length + 1; // +1 for the pipe
            });
        }
        // Pattern for array rules: ['required', 'string', 'max:255']
        const arrayMatches = line.matchAll(/['"`]([^'"`]+)['"`]/g);
        for (const match of arrayMatches) {
            const rule = match[1];
            if (this.isValidationRule(rule)) {
                const start = match.index || 0;
                const end = start + match[0].length;
                rules.push({ rule, range: { start, end } });
            }
        }
        return rules;
    }
    isValidationRule(rule) {
        const knownRules = this.validationProvider.getValidationRules().map(r => r.name);
        const ruleName = rule.split(':')[0];
        return knownRules.includes(ruleName);
    }
    validateRule(rule, document, lineIndex) {
        const issues = [];
        const [ruleName, ...params] = rule.split(':');
        const ruleDefinition = this.validationProvider.getValidationRule(ruleName);
        if (!ruleDefinition) {
            issues.push({
                message: `Unknown validation rule: ${ruleName}`,
                severity: vscode.DiagnosticSeverity.Error,
                code: 'unknown-rule'
            });
            return issues;
        }
        // Validate parameters
        if (ruleDefinition.parameters) {
            const expectedParams = ruleDefinition.parameters.filter(p => p.required).length;
            const providedParams = params.length > 0 ? params[0].split(',').length : 0;
            if (providedParams < expectedParams) {
                issues.push({
                    message: `Rule '${ruleName}' requires ${expectedParams} parameter(s), got ${providedParams}`,
                    severity: vscode.DiagnosticSeverity.Error,
                    code: 'missing-parameters'
                });
            }
        }
        // Validate specific rule logic
        if (ruleName === 'exists' || ruleName === 'unique') {
            const tables = this.validationProvider.getDatabaseTables();
            if (params.length > 0) {
                const tableName = params[0].split(',')[0];
                if (!tables.has(tableName)) {
                    issues.push({
                        message: `Table '${tableName}' not found in database schema`,
                        severity: vscode.DiagnosticSeverity.Warning,
                        code: 'table-not-found'
                    });
                }
            }
        }
        return issues;
    }
    dispose() {
        this.diagnosticCollection.dispose();
    }
}
exports.ValidationDiagnosticsProvider = ValidationDiagnosticsProvider;
// Code actions for validation rules
class ValidationCodeActionProvider {
    constructor(validationProvider) {
        this.validationProvider = validationProvider;
    }
    provideCodeActions(document, range, context, token) {
        const actions = [];
        context.diagnostics.forEach(diagnostic => {
            if (diagnostic.source === 'Laravel Validation') {
                switch (diagnostic.code) {
                    case 'unknown-rule':
                        actions.push(...this.createUnknownRuleActions(document, diagnostic));
                        break;
                    case 'missing-parameters':
                        actions.push(...this.createMissingParameterActions(document, diagnostic));
                        break;
                    case 'table-not-found':
                        actions.push(...this.createTableNotFoundActions(document, diagnostic));
                        break;
                }
            }
        });
        // Add general validation improvement actions
        const lineText = document.lineAt(range.start.line).text;
        if (this.isValidationContext(lineText)) {
            actions.push(...this.createValidationImprovementActions(document, range));
        }
        return actions;
    }
    createUnknownRuleActions(document, diagnostic) {
        const actions = [];
        // Extract the unknown rule name from the diagnostic message
        const match = diagnostic.message.match(/Unknown validation rule: (\w+)/);
        if (match) {
            const unknownRule = match[1];
            // Suggest similar rules
            const allRules = this.validationProvider.getValidationRules();
            const suggestions = allRules.filter(rule => this.calculateSimilarity(rule.name, unknownRule) > 0.6).slice(0, 3);
            suggestions.forEach(suggestion => {
                const action = new vscode.CodeAction(`Replace with '${suggestion.name}'`, vscode.CodeActionKind.QuickFix);
                action.edit = new vscode.WorkspaceEdit();
                action.edit.replace(document.uri, diagnostic.range, suggestion.name);
                actions.push(action);
            });
        }
        return actions;
    }
    createMissingParameterActions(document, diagnostic) {
        const actions = [];
        const action = new vscode.CodeAction('Add required parameters', vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'laravel.addValidationParameters',
            title: 'Add Parameters',
            arguments: [document.uri, diagnostic.range]
        };
        actions.push(action);
        return actions;
    }
    createTableNotFoundActions(document, diagnostic) {
        const actions = [];
        // Suggest available tables
        const tables = this.validationProvider.getDatabaseTables();
        const availableTables = Array.from(tables.keys()).slice(0, 5);
        availableTables.forEach(tableName => {
            const action = new vscode.CodeAction(`Use table '${tableName}'`, vscode.CodeActionKind.QuickFix);
            action.edit = new vscode.WorkspaceEdit();
            const currentText = document.getText(diagnostic.range);
            const newText = currentText.replace(/exists:[^,)]+/, `exists:${tableName}`);
            action.edit.replace(document.uri, diagnostic.range, newText);
            actions.push(action);
        });
        return actions;
    }
    createValidationImprovementActions(document, range) {
        const actions = [];
        // Add action to convert pipe-separated rules to array format
        const lineText = document.lineAt(range.start.line).text;
        if (lineText.includes('|') && !lineText.includes('[')) {
            const action = new vscode.CodeAction('Convert to array format', vscode.CodeActionKind.Refactor);
            action.command = {
                command: 'laravel.convertValidationFormat',
                title: 'Convert to Array Format',
                arguments: [document.uri, range.start.line]
            };
            actions.push(action);
        }
        // Add action to sort validation rules logically
        const action = new vscode.CodeAction('Sort validation rules', vscode.CodeActionKind.SourceOrganizeImports);
        action.command = {
            command: 'laravel.sortValidationRules',
            title: 'Sort Rules',
            arguments: [document.uri, range.start.line]
        };
        actions.push(action);
        return actions;
    }
    calculateSimilarity(a, b) {
        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;
        if (longer.length === 0)
            return 1.0;
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }
    levenshteinDistance(a, b) {
        const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
        for (let i = 0; i <= a.length; i++)
            matrix[0][i] = i;
        for (let j = 0; j <= b.length; j++)
            matrix[j][0] = j;
        for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
                const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + indicator // substitution
                );
            }
        }
        return matrix[b.length][a.length];
    }
    isValidationContext(lineText) {
        return lineText.includes('=>') &&
            (lineText.includes("'") || lineText.includes('"')) &&
            (lineText.includes('required') || lineText.includes('string') || lineText.includes('|'));
    }
}
exports.ValidationCodeActionProvider = ValidationCodeActionProvider;
// Validation commands
class ValidationCommands {
    static register(context, validationProvider) {
        // Add validation parameters command
        context.subscriptions.push(vscode.commands.registerCommand('laravel.addValidationParameters', (uri, range) => {
            this.addValidationParameters(uri, range, validationProvider);
        }));
        // Convert validation format command
        context.subscriptions.push(vscode.commands.registerCommand('laravel.convertValidationFormat', (uri, lineNumber) => {
            this.convertValidationFormat(uri, lineNumber);
        }));
        // Sort validation rules command
        context.subscriptions.push(vscode.commands.registerCommand('laravel.sortValidationRules', (uri, lineNumber) => {
            this.sortValidationRules(uri, lineNumber);
        }));
        // Show validation rule documentation
        context.subscriptions.push(vscode.commands.registerCommand('laravel.showValidationRules', () => {
            this.showValidationRulesPanel(validationProvider);
        }));
        // Generate validation from database
        context.subscriptions.push(vscode.commands.registerCommand('laravel.generateValidationFromDB', async () => {
            await this.generateValidationFromDatabase(validationProvider);
        }));
        // Validate all request files
        context.subscriptions.push(vscode.commands.registerCommand('laravel.validateAllRequests', () => {
            this.validateAllRequestFiles();
        }));
    }
    static async addValidationParameters(uri, range, validationProvider) {
        const document = await vscode.workspace.openTextDocument(uri);
        const ruleText = document.getText(range);
        const ruleName = ruleText.split(':')[0];
        const rule = validationProvider.getValidationRule(ruleName);
        if (!rule || !rule.parameters)
            return;
        const editor = await vscode.window.showTextDocument(document);
        // Build parameter snippet
        const params = rule.parameters.map((param, index) => {
            if (param.examples && param.examples.length > 0) {
                return `\${${index + 1}:${param.examples[0]}}`;
            }
            return `\${${index + 1}:${param.name}}`;
        }).join(',');
        const newText = `${ruleName}:${params}`;
        await editor.edit((editBuilder) => {
            editBuilder.replace(range, newText);
        });
    }
    static async convertValidationFormat(uri, lineNumber) {
        const document = await vscode.workspace.openTextDocument(uri);
        const line = document.lineAt(lineNumber);
        const lineText = line.text;
        // Extract rules from pipe-separated format
        const ruleMatch = lineText.match(/['"`]([^'"`]+)['"`]/);
        if (!ruleMatch)
            return;
        const rules = ruleMatch[1].split('|').map(rule => `'${rule.trim()}'`);
        const arrayFormat = `[${rules.join(', ')}]`;
        const editor = await vscode.window.showTextDocument(document);
        await editor.edit((editBuilder) => {
            const start = lineText.indexOf(ruleMatch[0]);
            const end = start + ruleMatch[0].length;
            const range = new vscode.Range(lineNumber, start, lineNumber, end);
            editBuilder.replace(range, arrayFormat);
        });
    }
    static async sortValidationRules(uri, lineNumber) {
        const document = await vscode.workspace.openTextDocument(uri);
        const line = document.lineAt(lineNumber);
        const lineText = line.text;
        // Define rule priority order
        const rulePriority = {
            'required': 1,
            'required_if': 1,
            'required_unless': 1,
            'required_with': 1,
            'required_without': 1,
            'nullable': 2,
            'sometimes': 2,
            'string': 3,
            'integer': 3,
            'numeric': 3,
            'boolean': 3,
            'array': 3,
            'file': 3,
            'image': 3,
            'min': 4,
            'max': 4,
            'size': 4,
            'between': 4,
            'email': 5,
            'url': 5,
            'regex': 5,
            'unique': 6,
            'exists': 6,
            'confirmed': 7
        };
        let rules = [];
        let isArrayFormat = false;
        // Extract rules
        if (lineText.includes('[')) {
            // Array format
            const arrayMatch = lineText.match(/\[([^\]]+)\]/);
            if (arrayMatch) {
                rules = arrayMatch[1].split(',').map(rule => rule.trim().replace(/['"]/g, ''));
                isArrayFormat = true;
            }
        }
        else {
            // Pipe-separated format
            const ruleMatch = lineText.match(/['"`]([^'"`]+)['"`]/);
            if (ruleMatch) {
                rules = ruleMatch[1].split('|');
            }
        }
        if (rules.length === 0)
            return;
        // Sort rules by priority
        rules.sort((a, b) => {
            const aPriority = rulePriority[a.split(':')[0]] || 99;
            const bPriority = rulePriority[b.split(':')[0]] || 99;
            return aPriority - bPriority;
        });
        // Reconstruct the rules string
        let newRulesText;
        if (isArrayFormat) {
            newRulesText = `[${rules.map(rule => `'${rule}'`).join(', ')}]`;
        }
        else {
            newRulesText = `'${rules.join('|')}'`;
        }
        const editor = await vscode.window.showTextDocument(document);
        await editor.edit((editBuilder) => {
            const match = isArrayFormat ?
                lineText.match(/\[[^\]]+\]/) :
                lineText.match(/['"`][^'"`]+['"`]/);
            if (match) {
                const start = lineText.indexOf(match[0]);
                const end = start + match[0].length;
                const range = new vscode.Range(lineNumber, start, lineNumber, end);
                editBuilder.replace(range, newRulesText);
            }
        });
    }
    static showValidationRulesPanel(validationProvider) {
        const panel = vscode.window.createWebviewPanel('validationRules', 'Laravel Validation Rules', vscode.ViewColumn.One, { enableScripts: true });
        const rules = validationProvider.getValidationRules();
        panel.webview.html = this.generateValidationRulesHtml(rules);
    }
    static generateValidationRulesHtml(rules) {
        const categorizedRules = rules.reduce((acc, rule) => {
            if (!acc[rule.category]) {
                acc[rule.category] = [];
            }
            acc[rule.category].push(rule);
            return acc;
        }, {});
        const categoryContent = Object.entries(categorizedRules).map(([category, categoryRules]) => {
            const rulesHtml = categoryRules.map(rule => `
                <div class="rule">
                    <div class="rule-header">
                        <h4>${rule.name}</h4>
                        <span class="rule-category">${rule.category}</span>
                    </div>
                    <p class="rule-description">${rule.description}</p>
                    ${rule.parameters ? `
                        <div class="parameters">
                            <strong>Parameters:</strong>
                            ${rule.parameters.map(param => `
                                <span class="parameter">
                                    ${param.name} (${param.type})${param.required ? '*' : ''}
                                </span>
                            `).join('')}
                        </div>
                    ` : ''}
                    <div class="examples">
                        <strong>Examples:</strong>
                        ${rule.examples.map(example => `<code>${example}</code>`).join(', ')}
                    </div>
                </div>
            `).join('');
            return `
                <div class="category">
                    <h3>${category}</h3>
                    ${rulesHtml}
                </div>
            `;
        }).join('');
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                        padding: 20px; 
                        line-height: 1.6; 
                    }
                    .category { margin-bottom: 30px; }
                    .category h3 { 
                        border-bottom: 2px solid #007acc; 
                        padding-bottom: 5px; 
                        color: #007acc; 
                    }
                    .rule { 
                        border: 1px solid #ddd; 
                        border-radius: 5px; 
                        padding: 15px; 
                        margin-bottom: 15px; 
                        background: #f9f9f9; 
                    }
                    .rule-header { 
                        display: flex; 
                        justify-content: space-between; 
                        align-items: center; 
                        margin-bottom: 10px; 
                    }
                    .rule-header h4 { 
                        margin: 0; 
                        color: #333; 
                        font-family: 'Courier New', monospace; 
                    }
                    .rule-category { 
                        background: #007acc; 
                        color: white; 
                        padding: 2px 8px; 
                        border-radius: 3px; 
                        font-size: 0.8em; 
                    }
                    .rule-description { 
                        margin-bottom: 10px; 
                        color: #666; 
                    }
                    .parameters { 
                        margin-bottom: 10px; 
                    }
                    .parameter { 
                        background: #e8f4fd; 
                        padding: 2px 6px; 
                        border-radius: 3px; 
                        margin-right: 5px; 
                        font-size: 0.9em; 
                        font-family: monospace; 
                    }
                    .examples code { 
                        background: #f0f0f0; 
                        padding: 2px 4px; 
                        border-radius: 3px; 
                        font-family: 'Courier New', monospace; 
                        margin-right: 5px; 
                    }
                    .search-box { 
                        margin-bottom: 20px; 
                        padding: 10px; 
                        width: 100%; 
                        border: 1px solid #ddd; 
                        border-radius: 5px; 
                        font-size: 16px; 
                    }
                </style>
            </head>
            <body>
                <h1>Laravel Validation Rules Reference</h1>
                <input type="text" class="search-box" placeholder="Search rules..." onkeyup="filterRules(this.value)">
                <div id="content">
                    ${categoryContent}
                </div>
                
                <script>
                    function filterRules(searchTerm) {
                        const rules = document.querySelectorAll('.rule');
                        const categories = document.querySelectorAll('.category');
                        
                        rules.forEach(rule => {
                            const text = rule.textContent.toLowerCase();
                            const matches = text.includes(searchTerm.toLowerCase());
                            rule.style.display = matches ? 'block' : 'none';
                        });
                        
                        categories.forEach(category => {
                            const visibleRules = category.querySelectorAll('.rule[style="display: block"], .rule:not([style])');
                            const hasVisibleRules = Array.from(visibleRules).some(rule => 
                                !rule.style.display || rule.style.display === 'block'
                            );
                            category.style.display = hasVisibleRules || !searchTerm ? 'block' : 'none';
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }
    static async generateValidationFromDatabase(validationProvider) {
        const tables = validationProvider.getDatabaseTables();
        const tableNames = Array.from(tables.keys());
        if (tableNames.length === 0) {
            vscode.window.showWarningMessage('No database tables found. Make sure your migrations are in place.');
            return;
        }
        const selectedTable = await vscode.window.showQuickPick(tableNames, {
            placeHolder: 'Select a table to generate validation rules'
        });
        if (!selectedTable)
            return;
        const table = tables.get(selectedTable);
        const validationRules = this.generateValidationRulesFromTable(table);
        // Create new file with validation rules
        const doc = await vscode.workspace.openTextDocument({
            content: validationRules,
            language: 'php'
        });
        await vscode.window.showTextDocument(doc);
    }
    static generateValidationRulesFromTable(table) {
        const rules = table.columns.map((column) => {
            let ruleSet = ['required'];
            // Add type-specific rules based on column name patterns
            if (column === 'email') {
                ruleSet.push('string', 'email', 'max:255');
            }
            else if (column.includes('password')) {
                ruleSet.push('string', 'min:8');
            }
            else if (column.endsWith('_id')) {
                ruleSet = ['required', 'integer', `exists:${column.replace('_id', 's')},id`];
            }
            else if (column.includes('phone')) {
                ruleSet.push('string', 'regex:/^\\+?[1-9]\\d{1,14}$/');
            }
            else if (column.includes('url') || column.includes('website')) {
                ruleSet.push('string', 'url');
            }
            else if (column.includes('date') || column.endsWith('_at')) {
                ruleSet = ['required', 'date'];
            }
            else if (column.includes('name') || column.includes('title')) {
                ruleSet.push('string', 'max:255');
            }
            else {
                ruleSet.push('string', 'max:255');
            }
            return `            '${column}' => '${ruleSet.join('|')}',`;
        }).join('\n');
        return `<?php

namespace App\\Http\\Requests;

use Illuminate\\Foundation\\Http\\FormRequest;

class ${this.toPascalCase(table.name)}Request extends FormRequest
{
    public function authorize()
    {
        return true;
    }

    public function rules()
    {
        return [
${rules}
        ];
    }
}`;
    }
    static toPascalCase(str) {
        return str
            .replace(/_(.)/g, (_, char) => char.toUpperCase())
            .replace(/^(.)/, char => char.toUpperCase())
            .replace(/s$/, ''); // Remove trailing 's' for singular form
    }
    static validateAllRequestFiles() {
        vscode.workspace.findFiles('**/app/Http/Requests/**/*.php').then(files => {
            let issueCount = 0;
            const promises = files.map(async (file) => {
                const document = await vscode.workspace.openTextDocument(file);
                const diagnostics = vscode.languages.getDiagnostics(file);
                const validationIssues = diagnostics.filter(d => d.source === 'Laravel Validation');
                issueCount += validationIssues.length;
            });
            Promise.all(promises).then(() => {
                if (issueCount === 0) {
                    vscode.window.showInformationMessage('✅ All validation rules are valid!');
                }
                else {
                    vscode.window.showWarningMessage(`⚠️ Found ${issueCount} validation issues across ${files.length} request files.`);
                }
            });
        });
    }
}
exports.ValidationCommands = ValidationCommands;
//# sourceMappingURL=validationHoverProvider.js.map