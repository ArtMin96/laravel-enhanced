"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigCompletionProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
class ConfigCompletionProvider {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.configKeys = new Set();
        this.envKeys = new Set();
        this.loadConfigKeys();
        this.loadEnvKeys();
        this.setupWatchers();
    }
    setupWatchers() {
        // Watch config files
        const configWatcher = vscode.workspace.createFileSystemWatcher('**/config/**/*.php');
        configWatcher.onDidChange(() => this.loadConfigKeys());
        configWatcher.onDidCreate(() => this.loadConfigKeys());
        configWatcher.onDidDelete(() => this.loadConfigKeys());
        // Watch .env files
        const envWatcher = vscode.workspace.createFileSystemWatcher('**/.env*');
        envWatcher.onDidChange(() => this.loadEnvKeys());
        envWatcher.onDidCreate(() => this.loadEnvKeys());
        envWatcher.onDidDelete(() => this.loadEnvKeys());
    }
    loadConfigKeys() {
        this.configKeys.clear();
        const configPath = path.join(this.workspaceRoot, 'config');
        if (!fs.existsSync(configPath))
            return;
        const configFiles = fs.readdirSync(configPath)
            .filter(file => file.endsWith('.php'));
        configFiles.forEach(file => {
            const filePath = path.join(configPath, file);
            const configName = path.basename(file, '.php');
            this.parseConfigFile(filePath, configName);
        });
    }
    parseConfigFile(filePath, configName) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            // Extract array keys from config file
            const keyPattern = /['"`]([a-zA-Z_][a-zA-Z0-9_.-]*?)['"`]\s*=>/g;
            let match;
            while ((match = keyPattern.exec(content)) !== null) {
                const key = match[1];
                this.configKeys.add(`${configName}.${key}`);
                // Also add nested keys if they look like dot notation
                if (key.includes('.')) {
                    const parts = key.split('.');
                    let partial = configName;
                    for (const part of parts) {
                        partial += `.${part}`;
                        this.configKeys.add(partial);
                    }
                }
            }
            // Add common Laravel config keys
            this.addCommonConfigKeys(configName);
        }
        catch (error) {
            console.error(`Error parsing config file ${filePath}:`, error);
        }
    }
    addCommonConfigKeys(configName) {
        const commonKeys = {
            'app': [
                'name', 'env', 'debug', 'url', 'timezone', 'locale', 'fallback_locale',
                'faker_locale', 'key', 'cipher', 'providers', 'aliases'
            ],
            'database': [
                'default', 'connections', 'migrations', 'redis'
            ],
            'cache': [
                'default', 'stores', 'prefix'
            ],
            'mail': [
                'default', 'mailers', 'from.address', 'from.name'
            ],
            'session': [
                'driver', 'lifetime', 'expire_on_close', 'encrypt', 'files', 'connection',
                'table', 'store', 'lottery', 'cookie', 'path', 'domain', 'secure',
                'http_only', 'same_site'
            ],
            'queue': [
                'default', 'connections', 'failed'
            ],
            'auth': [
                'defaults', 'guards', 'providers', 'passwords'
            ],
            'services': [
                'mailgun', 'postmark', 'ses'
            ]
        };
        if (commonKeys[configName]) {
            commonKeys[configName].forEach(key => {
                this.configKeys.add(`${configName}.${key}`);
            });
        }
    }
    loadEnvKeys() {
        this.envKeys.clear();
        const envFiles = ['.env', '.env.example', '.env.local'];
        envFiles.forEach(envFile => {
            const envPath = path.join(this.workspaceRoot, envFile);
            if (fs.existsSync(envPath)) {
                this.parseEnvFile(envPath);
            }
        });
        // Add common Laravel env keys
        this.addCommonEnvKeys();
    }
    parseEnvFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('#')) {
                    const equalIndex = trimmedLine.indexOf('=');
                    if (equalIndex > 0) {
                        const key = trimmedLine.substring(0, equalIndex).trim();
                        this.envKeys.add(key);
                    }
                }
            });
        }
        catch (error) {
            console.error(`Error parsing env file ${filePath}:`, error);
        }
    }
    addCommonEnvKeys() {
        const commonEnvKeys = [
            'APP_NAME', 'APP_ENV', 'APP_KEY', 'APP_DEBUG', 'APP_URL',
            'LOG_CHANNEL', 'LOG_DEPRECATIONS_CHANNEL', 'LOG_LEVEL',
            'DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD',
            'BROADCAST_DRIVER', 'CACHE_DRIVER', 'FILESYSTEM_DISK', 'QUEUE_CONNECTION',
            'SESSION_DRIVER', 'SESSION_LIFETIME',
            'MEMCACHED_HOST', 'REDIS_HOST', 'REDIS_PASSWORD', 'REDIS_PORT',
            'MAIL_MAILER', 'MAIL_HOST', 'MAIL_PORT', 'MAIL_USERNAME', 'MAIL_PASSWORD',
            'MAIL_ENCRYPTION', 'MAIL_FROM_ADDRESS', 'MAIL_FROM_NAME',
            'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_DEFAULT_REGION', 'AWS_BUCKET',
            'PUSHER_APP_ID', 'PUSHER_APP_KEY', 'PUSHER_APP_SECRET', 'PUSHER_HOST',
            'PUSHER_PORT', 'PUSHER_SCHEME', 'PUSHER_APP_CLUSTER',
            'VITE_PUSHER_APP_KEY', 'VITE_PUSHER_HOST', 'VITE_PUSHER_PORT',
            'VITE_PUSHER_SCHEME', 'VITE_PUSHER_APP_CLUSTER'
        ];
        commonEnvKeys.forEach(key => this.envKeys.add(key));
    }
    provideCompletionItems(document, position, token, context) {
        const lineText = document.lineAt(position).text;
        const beforeCursor = lineText.substring(0, position.character);
        // Config completion
        const configCompletions = this.provideConfigCompletion(beforeCursor);
        if (configCompletions.length > 0) {
            return configCompletions;
        }
        // Env completion
        const envCompletions = this.provideEnvCompletion(beforeCursor);
        if (envCompletions.length > 0) {
            return envCompletions;
        }
        return [];
    }
    provideConfigCompletion(beforeCursor) {
        const patterns = [
            // config('app.name')
            /config\s*\(\s*['"`]([^'"`]*)$/,
            // Config::get('app.name')
            /Config::get\s*\(\s*['"`]([^'"`]*)$/,
            // config()->get('app.name')
            /config\s*\(\s*\)->get\s*\(\s*['"`]([^'"`]*)$/,
            // @config('app.name')
            /@config\s*\(\s*['"`]([^'"`]*)$/
        ];
        for (const pattern of patterns) {
            const match = beforeCursor.match(pattern);
            if (match) {
                const prefix = match[1];
                return this.getConfigCompletions(prefix);
            }
        }
        return [];
    }
    provideEnvCompletion(beforeCursor) {
        const patterns = [
            // env('APP_NAME')
            /env\s*\(\s*['"`]([^'"`]*)$/,
            // $_ENV['APP_NAME']
            /\$_ENV\s*\[\s*['"`]([^'"`]*)$/,
            // getenv('APP_NAME')
            /getenv\s*\(\s*['"`]([^'"`]*)$/
        ];
        for (const pattern of patterns) {
            const match = beforeCursor.match(pattern);
            if (match) {
                const prefix = match[1];
                return this.getEnvCompletions(prefix);
            }
        }
        return [];
    }
    getConfigCompletions(prefix) {
        const completions = [];
        this.configKeys.forEach(key => {
            if (key.startsWith(prefix)) {
                const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
                item.detail = 'Laravel Config';
                item.documentation = new vscode.MarkdownString(`**Config Key:** \`${key}\`\n\n` +
                    `Access this configuration value with \`config('${key}')\``);
                item.insertText = key;
                completions.push(item);
            }
        });
        return completions;
    }
    getEnvCompletions(prefix) {
        const completions = [];
        this.envKeys.forEach(key => {
            if (key.startsWith(prefix)) {
                const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Variable);
                item.detail = 'Environment Variable';
                item.documentation = new vscode.MarkdownString(`**Environment Variable:** \`${key}\`\n\n` +
                    `Access this environment value with \`env('${key}')\``);
                item.insertText = key;
                completions.push(item);
            }
        });
        return completions;
    }
    // Getter methods for the extension
    getConfigKeys() {
        return this.configKeys;
    }
    getEnvKeys() {
        return this.envKeys;
    }
    getConfigKeysCount() {
        return this.configKeys.size;
    }
    getEnvKeysCount() {
        return this.envKeys.size;
    }
    getAllConfigKeys() {
        return Array.from(this.configKeys);
    }
    getAllEnvKeys() {
        return Array.from(this.envKeys);
    }
}
exports.ConfigCompletionProvider = ConfigCompletionProvider;
//# sourceMappingURL=configCompletionProvider.js.map