"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationCommands = exports.TranslationHoverProvider = exports.TranslationCompletionProvider = exports.TranslationProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
class TranslationProvider {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.translations = new Map();
        this.usages = [];
        this.watchers = [];
        this.loadTranslations();
        this.scanForUsages();
        this.setupWatchers();
    }
    // Load all translation files
    loadTranslations() {
        const langPath = path.join(this.workspaceRoot, 'lang');
        const resourcesLangPath = path.join(this.workspaceRoot, 'resources', 'lang');
        // Check both possible lang directories
        const translationPaths = [langPath, resourcesLangPath].filter(p => fs.existsSync(p));
        translationPaths.forEach(basePath => {
            this.scanTranslationDirectory(basePath);
        });
    }
    scanTranslationDirectory(basePath) {
        const locales = fs.readdirSync(basePath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        locales.forEach(locale => {
            const localePath = path.join(basePath, locale);
            this.scanLocaleDirectory(localePath, locale);
        });
    }
    scanLocaleDirectory(localePath, locale) {
        const files = fs.readdirSync(localePath)
            .filter(file => file.endsWith('.php') || file.endsWith('.json'));
        files.forEach(file => {
            const filePath = path.join(localePath, file);
            if (file.endsWith('.php')) {
                this.parsePhpTranslationFile(filePath, locale, file);
            }
            else if (file.endsWith('.json')) {
                this.parseJsonTranslationFile(filePath, locale);
            }
        });
    }
    parsePhpTranslationFile(filePath, locale, fileName) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            // Extract array keys and values
            const arrayMatch = content.match(/return\s*\[([\s\S]*)\];/);
            if (!arrayMatch)
                return;
            const namespace = fileName.replace('.php', '');
            this.parsePhpArray(arrayMatch[1], lines, filePath, locale, namespace);
        }
        catch (error) {
            console.error(`Error parsing translation file ${filePath}:`, error);
        }
    }
    parsePhpArray(content, lines, filePath, locale, namespace, prefix = '') {
        // Simple regex to match PHP array key-value pairs
        const keyValueRegex = /['"]([^'"]+)['"]\s*=>\s*(?:['"]([^'"]*?)['"]|\[([\s\S]*?)\](?=\s*[,\]]))/g;
        let match;
        while ((match = keyValueRegex.exec(content)) !== null) {
            const [fullMatch, key, simpleValue, arrayValue] = match;
            const fullKey = prefix ? `${prefix}.${key}` : key;
            const translationKey = `${namespace}.${fullKey}`;
            if (simpleValue !== undefined) {
                // Simple string value
                const lineNumber = this.findLineNumber(lines, fullMatch);
                this.addTranslation(translationKey, filePath, locale, simpleValue, lineNumber);
            }
            else if (arrayValue !== undefined) {
                // Nested array - recursively parse
                this.parsePhpArray(arrayValue, lines, filePath, locale, namespace, fullKey);
            }
        }
    }
    parseJsonTranslationFile(filePath, locale) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const translations = JSON.parse(content);
            this.parseJsonObject(translations, filePath, locale);
        }
        catch (error) {
            console.error(`Error parsing JSON translation file ${filePath}:`, error);
        }
    }
    parseJsonObject(obj, filePath, locale, prefix = '') {
        Object.keys(obj).forEach(key => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            const value = obj[key];
            if (typeof value === 'string') {
                this.addTranslation(fullKey, filePath, locale, value);
            }
            else if (typeof value === 'object' && value !== null) {
                this.parseJsonObject(value, filePath, locale, fullKey);
            }
        });
    }
    addTranslation(key, file, locale, value, line) {
        if (!this.translations.has(key)) {
            this.translations.set(key, []);
        }
        this.translations.get(key).push({
            key,
            file,
            locale,
            value,
            line,
            isUsed: false
        });
    }
    findLineNumber(lines, searchText) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(searchText.substring(0, 20))) {
                return i + 1;
            }
        }
        return 1;
    }
    // Scan for translation usage in PHP and Blade files
    scanForUsages() {
        const patterns = [
            '**/*.php',
            '**/*.blade.php'
        ];
        patterns.forEach(pattern => {
            vscode.workspace.findFiles(pattern, '**/vendor/**').then(files => {
                files.forEach(file => {
                    this.scanFileForUsages(file.fsPath);
                });
            });
        });
    }
    scanFileForUsages(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            // Patterns for different translation methods
            const patterns = [
                // trans('key')
                { regex: /trans\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'trans' },
                // __('key')
                { regex: /__\s*\(\s*['"`]([^'"`]+)['"`]/g, method: '__' },
                // trans_choice('key', count)
                { regex: /trans_choice\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'trans_choice' },
                // @lang('key') in Blade
                { regex: /@lang\s*\(\s*['"`]([^'"`]+)['"`]/g, method: '@lang' },
                // {{ trans('key') }} in Blade
                { regex: /\{\{\s*trans\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'trans' },
                // {{ __('key') }} in Blade
                { regex: /\{\{\s*__\s*\(\s*['"`]([^'"`]+)['"`]/g, method: '__' }
            ];
            patterns.forEach(({ regex, method }) => {
                let match;
                while ((match = regex.exec(content)) !== null) {
                    const key = match[1];
                    const lineNumber = this.findLineNumberForMatch(lines, match.index);
                    const column = this.findColumnForMatch(content, match.index);
                    this.usages.push({
                        key,
                        file: filePath,
                        line: lineNumber,
                        column,
                        method
                    });
                    // Mark translation as used
                    this.markTranslationAsUsed(key);
                }
            });
        }
        catch (error) {
            console.error(`Error scanning file ${filePath}:`, error);
        }
    }
    findLineNumberForMatch(lines, index) {
        let currentIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            currentIndex += lines[i].length + 1; // +1 for newline
            if (currentIndex > index) {
                return i + 1;
            }
        }
        return lines.length;
    }
    findColumnForMatch(content, index) {
        const beforeMatch = content.substring(0, index);
        const lastNewline = beforeMatch.lastIndexOf('\n');
        return index - lastNewline;
    }
    markTranslationAsUsed(key) {
        const translations = this.translations.get(key);
        if (translations) {
            translations.forEach(t => t.isUsed = true);
        }
    }
    // Setup file watchers for translation files
    setupWatchers() {
        const patterns = [
            '**/lang/**/*.php',
            '**/lang/**/*.json',
            '**/resources/lang/**/*.php',
            '**/resources/lang/**/*.json'
        ];
        patterns.forEach(pattern => {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            watcher.onDidChange(() => this.reloadTranslations());
            watcher.onDidCreate(() => this.reloadTranslations());
            watcher.onDidDelete(() => this.reloadTranslations());
            this.watchers.push(watcher);
        });
    }
    reloadTranslations() {
        this.translations.clear();
        this.usages = [];
        this.loadTranslations();
        this.scanForUsages();
    }
    // Public methods for extension features
    getTranslation(key, locale) {
        const translations = this.translations.get(key);
        if (!translations)
            return undefined;
        if (locale) {
            return translations.find(t => t.locale === locale);
        }
        return translations[0]; // Return first available
    }
    getAllTranslations() {
        return this.translations;
    }
    getUnusedTranslations() {
        const unused = [];
        this.translations.forEach(translations => {
            translations.forEach(translation => {
                if (!translation.isUsed) {
                    unused.push(translation);
                }
            });
        });
        return unused;
    }
    getMissingTranslations() {
        const missing = [];
        const allKeys = new Set();
        // Collect all translation keys from usages
        this.usages.forEach(usage => allKeys.add(usage.key));
        // Check which keys don't have translations
        allKeys.forEach(key => {
            if (!this.translations.has(key)) {
                missing.push(key);
            }
        });
        return missing;
    }
    getTranslationUsages(key) {
        return this.usages.filter(usage => usage.key === key);
    }
    getLocales() {
        const locales = new Set();
        this.translations.forEach(translations => {
            translations.forEach(t => locales.add(t.locale));
        });
        return Array.from(locales);
    }
    dispose() {
        this.watchers.forEach(watcher => watcher.dispose());
    }
}
exports.TranslationProvider = TranslationProvider;
// Completion provider for translation keys
class TranslationCompletionProvider {
    constructor(translationProvider) {
        this.translationProvider = translationProvider;
    }
    provideCompletionItems(document, position) {
        const lineText = document.lineAt(position).text;
        const beforeCursor = lineText.substring(0, position.character);
        // Check if we're inside a translation function call
        const translationPatterns = [
            /trans\s*\(\s*['"`]([^'"`]*)$/,
            /__\s*\(\s*['"`]([^'"`]*)$/,
            /trans_choice\s*\(\s*['"`]([^'"`]*)$/,
            /@lang\s*\(\s*['"`]([^'"`]*)$/
        ];
        const isInTranslationCall = translationPatterns.some(pattern => pattern.test(beforeCursor));
        if (!isInTranslationCall) {
            return [];
        }
        const completions = [];
        const translations = this.translationProvider.getAllTranslations();
        translations.forEach((translationList, key) => {
            const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Text);
            // Show value from default locale as detail
            const defaultTranslation = translationList.find(t => t.locale === 'en') || translationList[0];
            if (defaultTranslation) {
                item.detail = defaultTranslation.value;
                item.documentation = new vscode.MarkdownString(`**Available in locales:** ${translationList.map(t => t.locale).join(', ')}\n\n` +
                    `**Value:** ${defaultTranslation.value}`);
            }
            item.insertText = key;
            completions.push(item);
        });
        return completions;
    }
}
exports.TranslationCompletionProvider = TranslationCompletionProvider;
// Hover provider for translation keys
class TranslationHoverProvider {
    constructor(translationProvider) {
        this.translationProvider = translationProvider;
    }
    provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position, /['"`]([^'"`]+)['"`]/);
        if (!range)
            return undefined;
        const text = document.getText(range);
        const key = text.replace(/['"`]/g, '');
        const translations = this.translationProvider.getAllTranslations().get(key);
        if (!translations)
            return undefined;
        const contents = [];
        translations.forEach(translation => {
            const content = new vscode.MarkdownString();
            content.appendMarkdown(`**${translation.locale}:** ${translation.value}\n\n`);
            content.appendMarkdown(`_File: ${path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, translation.file)}_`);
            contents.push(content);
        });
        return new vscode.Hover(contents, range);
    }
}
exports.TranslationHoverProvider = TranslationHoverProvider;
// Commands for translation management
class TranslationCommands {
    static register(context, translationProvider) {
        // Show unused translations
        context.subscriptions.push(vscode.commands.registerCommand('laravel.showUnusedTranslations', () => {
            const unused = translationProvider.getUnusedTranslations();
            const panel = vscode.window.createWebviewPanel('unusedTranslations', 'Unused Translations', vscode.ViewColumn.One, {});
            panel.webview.html = this.generateUnusedTranslationsHtml(unused);
        }));
        // Show missing translations
        context.subscriptions.push(vscode.commands.registerCommand('laravel.showMissingTranslations', () => {
            const missing = translationProvider.getMissingTranslations();
            if (missing.length === 0) {
                vscode.window.showInformationMessage('No missing translations found!');
                return;
            }
            const message = `Found ${missing.length} missing translations:\n${missing.join('\n')}`;
            vscode.window.showWarningMessage(message);
        }));
        // Extract translation key
        context.subscriptions.push(vscode.commands.registerCommand('laravel.extractTranslation', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor)
                return;
            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);
            if (!selectedText) {
                vscode.window.showWarningMessage('Please select text to extract as translation');
                return;
            }
            const key = await vscode.window.showInputBox({
                prompt: 'Enter translation key',
                placeHolder: 'messages.welcome'
            });
            if (key) {
                // Replace selected text with translation call
                await editor.edit(editBuilder => {
                    editBuilder.replace(selection, `{{ __('${key}') }}`);
                });
                vscode.window.showInformationMessage(`Translation key '${key}' created. Don't forget to add it to your translation files!`);
            }
        }));
    }
    static generateUnusedTranslationsHtml(unused) {
        const rows = unused.map(t => `<tr>
                <td>${t.key}</td>
                <td>${t.locale}</td>
                <td>${t.value}</td>
                <td>${path.basename(t.file)}</td>
            </tr>`).join('');
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                </style>
            </head>
            <body>
                <h2>Unused Translations (${unused.length})</h2>
                <table>
                    <tr>
                        <th>Key</th>
                        <th>Locale</th>
                        <th>Value</th>
                        <th>File</th>
                    </tr>
                    ${rows}
                </table>
            </body>
            </html>
        `;
    }
}
exports.TranslationCommands = TranslationCommands;
//# sourceMappingURL=translationProvider.js.map