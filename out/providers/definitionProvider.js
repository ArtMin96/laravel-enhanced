"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LaravelDefinitionProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
class LaravelDefinitionProvider {
    constructor(workspaceRoot, configProvider, translationProvider) {
        this.workspaceRoot = workspaceRoot;
        this.configProvider = configProvider;
        this.translationProvider = translationProvider;
    }
    provideDefinition(document, position, token) {
        const line = document.lineAt(position).text;
        const quotedText = this.extractQuotedText(line, position.character);
        if (!quotedText) {
            return undefined;
        }
        const beforeQuote = line.substring(0, quotedText.startIndex);
        if (this.isConfigCall(beforeQuote)) {
            return this.findConfigKeyLocation(quotedText.text);
        }
        if (this.isEnvCall(beforeQuote)) {
            return this.findEnvKeyLocation(quotedText.text);
        }
        if (this.isTranslationCall(beforeQuote)) {
            return this.findTranslationKeyLocation(quotedText.text);
        }
        return undefined;
    }
    extractQuotedText(line, cursorPosition) {
        const quotes = ['"', "'", '`'];
        for (const quote of quotes) {
            let inQuote = false;
            let startIndex = -1;
            let endIndex = -1;
            for (let i = 0; i < line.length; i++) {
                if (line[i] === quote) {
                    if (!inQuote) {
                        startIndex = i + 1;
                        inQuote = true;
                    }
                    else {
                        endIndex = i;
                        inQuote = false;
                        if (cursorPosition >= startIndex && cursorPosition <= endIndex) {
                            return {
                                text: line.substring(startIndex, endIndex),
                                startIndex,
                                endIndex
                            };
                        }
                    }
                }
            }
            if (inQuote && cursorPosition >= startIndex) {
                return {
                    text: line.substring(startIndex),
                    startIndex,
                    endIndex: line.length
                };
            }
        }
        return null;
    }
    isConfigCall(beforeQuote) {
        const configPatterns = [
            /config\s*\(\s*['"`]?$/,
            /Config::get\s*\(\s*['"`]?$/,
            /config\s*\(\s*\)\s*->\s*get\s*\(\s*['"`]?$/,
            /@config\s*\(\s*['"`]?$/
        ];
        for (let i = 0; i < configPatterns.length; i++) {
            const pattern = configPatterns[i];
            if (pattern.test(beforeQuote))
                return true;
        }
        return false;
    }
    isEnvCall(beforeQuote) {
        const envPatterns = [
            /env\s*\(\s*['"`]?$/,
            /\$_ENV\s*\[\s*['"`]?$/,
            /getenv\s*\(\s*['"`]?$/
        ];
        for (let i = 0; i < envPatterns.length; i++) {
            const pattern = envPatterns[i];
            if (pattern.test(beforeQuote))
                return true;
        }
        return false;
    }
    isTranslationCall(beforeQuote) {
        const translationPatterns = [
            /trans\s*\(\s*['"`]?$/,
            /__\s*\(\s*['"`]?$/,
            /trans_choice\s*\(\s*['"`]?$/,
            /@lang\s*\(\s*['"`]?$/,
            /\{\{\s*trans\s*\(\s*['"`]?$/,
            /\{\{\s*__\s*\(\s*['"`]?$/
        ];
        for (let i = 0; i < translationPatterns.length; i++) {
            const pattern = translationPatterns[i];
            if (pattern.test(beforeQuote))
                return true;
        }
        return false;
    }
    findConfigKeyLocation(configKey) {
        const parts = configKey.split('.');
        if (parts.length < 2) {
            return undefined;
        }
        const configFile = parts[0];
        const keyPath = parts.slice(1);
        const possiblePaths = [
            path.join(this.workspaceRoot, 'config', `${configFile}.php`)
        ];
        for (const configFilePath of possiblePaths) {
            if (fs.existsSync(configFilePath)) {
                const location = this.findKeyInConfigFile(configFilePath, keyPath);
                if (location) {
                    return location;
                }
            }
        }
        return undefined;
    }
    findKeyInConfigFile(filePath, keyPath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const targetKey = keyPath[0];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const patterns = [
                    new RegExp(`['"]${this.escapeRegex(targetKey)}['"]\\s*=>`),
                    new RegExp(`'${this.escapeRegex(targetKey)}'\\s*=>`),
                    new RegExp(`"${this.escapeRegex(targetKey)}"\\s*=>`)
                ];
                for (const pattern of patterns) {
                    if (pattern.test(line)) {
                        const keyIndex = Math.max(line.indexOf(`'${targetKey}'`), line.indexOf(`"${targetKey}"`), line.indexOf(`\`${targetKey}\``));
                        const position = new vscode.Position(i, keyIndex >= 0 ? keyIndex : 0);
                        return new vscode.Location(vscode.Uri.file(filePath), position);
                    }
                }
            }
        }
        catch (error) {
            console.error(`❌ Error reading config file ${filePath}:`, error);
        }
        return undefined;
    }
    findEnvKeyLocation(envKey) {
        const envFiles = ['.env', '.env.example', '.env.local'];
        for (const envFile of envFiles) {
            const envPath = path.join(this.workspaceRoot, envFile);
            if (fs.existsSync(envPath)) {
                const location = this.findKeyInEnvFile(envPath, envKey);
                if (location) {
                    return location;
                }
            }
        }
        return undefined;
    }
    findKeyInEnvFile(filePath, envKey) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith(`${envKey}=`) || line.startsWith(`${envKey} =`)) {
                    const position = new vscode.Position(i, line.indexOf(envKey));
                    return new vscode.Location(vscode.Uri.file(filePath), position);
                }
            }
        }
        catch (error) {
            console.error(`❌ Error reading env file ${filePath}:`, error);
        }
        return undefined;
    }
    findTranslationKeyLocation(translationKey) {
        const parts = translationKey.split('.');
        if (parts.length < 2) {
            return undefined;
        }
        const namespace = parts[0];
        const keyPath = parts.slice(1);
        const translationDirs = [
            path.join(this.workspaceRoot, 'lang'),
            path.join(this.workspaceRoot, 'resources', 'lang')
        ];
        for (const langDir of translationDirs) {
            if (!fs.existsSync(langDir)) {
                continue;
            }
            const locales = fs.readdirSync(langDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            const sortedLocales = locales.sort((a, b) => {
                if (a === 'en')
                    return -1;
                if (b === 'en')
                    return 1;
                return a.localeCompare(b);
            });
            for (const locale of sortedLocales) {
                const translationFile = path.join(langDir, locale, `${namespace}.php`);
                if (fs.existsSync(translationFile)) {
                    const location = this.findKeyInTranslationFile(translationFile, keyPath);
                    if (location) {
                        return location;
                    }
                }
            }
        }
        return undefined;
    }
    findKeyInTranslationFile(filePath, keyPath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const targetKey = keyPath[0];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const patterns = [
                    new RegExp(`['"]${this.escapeRegex(targetKey)}['"]\\s*=>`),
                    new RegExp(`'${this.escapeRegex(targetKey)}'\\s*=>`),
                    new RegExp(`"${this.escapeRegex(targetKey)}"\\s*=>`)
                ];
                for (const pattern of patterns) {
                    if (pattern.test(line)) {
                        const keyIndex = Math.max(line.indexOf(`'${targetKey}'`), line.indexOf(`"${targetKey}"`), line.indexOf(`\`${targetKey}\``));
                        const position = new vscode.Position(i, keyIndex >= 0 ? keyIndex : 0);
                        return new vscode.Location(vscode.Uri.file(filePath), position);
                    }
                }
            }
        }
        catch (error) {
            console.error(`❌ Error reading translation file ${filePath}:`, error);
        }
        return undefined;
    }
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
exports.LaravelDefinitionProvider = LaravelDefinitionProvider;
//# sourceMappingURL=definitionProvider.js.map