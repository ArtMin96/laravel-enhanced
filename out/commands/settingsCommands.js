"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsCommands = void 0;
const vscode = require("vscode");
class SettingsCommands {
    static register(context) {
        context.subscriptions.push(vscode.commands.registerCommand('laravel.openSettings', () => {
            this.showSettingsPanel();
        }));
    }
    static showSettingsPanel() {
        const panel = vscode.window.createWebviewPanel('laravelSettings', 'Laravel Enhanced Settings', vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = this.generateSettingsHtml();
        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'updateSetting':
                    this.updateSetting(message.key, message.value);
                    vscode.window.showInformationMessage(`Setting updated: ${message.key}`);
                    break;
                case 'resetSettings':
                    this.resetAllSettings();
                    vscode.window.showInformationMessage('All settings reset to defaults');
                    panel.webview.html = this.generateSettingsHtml();
                    break;
            }
        }, undefined, undefined);
    }
    static updateSetting(key, value) {
        const config = vscode.workspace.getConfiguration('laravelEnhanced');
        config.update(key, value, vscode.ConfigurationTarget.Global);
    }
    static resetAllSettings() {
        const config = vscode.workspace.getConfiguration('laravelEnhanced');
        const keys = [
            'inlayHints.routes.enabled',
            'codeLens.controller.enabled',
            'routes.showMiddleware',
            'routes.showParameters',
            'inlayHints.style',
            'completion.models.enabled',
            'completion.views.enabled',
            'completion.requests.enabled',
            'completion.translations.enabled',
            'validation.enabled',
            'validation.showDescriptions',
            'validation.smartSuggestions',
            'validation.quickCombinations'
        ];
        keys.forEach(key => {
            config.update(key, undefined, vscode.ConfigurationTarget.Global);
        });
    }
    static generateSettingsHtml() {
        const config = vscode.workspace.getConfiguration('laravelEnhanced');
        return `
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
                        max-width: 800px; 
                        margin: 0 auto; 
                        background: white; 
                        border-radius: 8px; 
                        padding: 30px; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 30px; 
                        padding-bottom: 20px; 
                        border-bottom: 2px solid #e9ecef;
                    }
                    .header h1 { 
                        color: #495057; 
                        margin: 0; 
                    }
                    .section { 
                        margin-bottom: 30px; 
                        padding: 20px; 
                        border: 1px solid #dee2e6; 
                        border-radius: 6px; 
                        background: #f8f9fa;
                    }
                    .section h2 { 
                        margin-top: 0; 
                        color: #007acc; 
                        border-bottom: 1px solid #dee2e6; 
                        padding-bottom: 10px;
                    }
                    .setting-row { 
                        display: flex; 
                        justify-content: space-between; 
                        align-items: center; 
                        margin-bottom: 15px; 
                        padding: 10px; 
                        background: white; 
                        border-radius: 4px;
                    }
                    .setting-label { 
                        flex: 1; 
                        margin-right: 20px;
                    }
                    .setting-title { 
                        font-weight: 600; 
                        color: #495057; 
                        margin-bottom: 4px;
                    }
                    .setting-description { 
                        font-size: 0.9em; 
                        color: #6c757d;
                    }
                    .toggle-switch { 
                        position: relative; 
                        width: 60px; 
                        height: 30px; 
                        background: #ccc; 
                        border-radius: 15px; 
                        cursor: pointer; 
                        transition: background 0.3s;
                    }
                    .toggle-switch.active { 
                        background: #007acc; 
                    }
                    .toggle-switch::after { 
                        content: ''; 
                        position: absolute; 
                        width: 26px; 
                        height: 26px; 
                        border-radius: 50%; 
                        background: white; 
                        top: 2px; 
                        left: 2px; 
                        transition: left 0.3s;
                    }
                    .toggle-switch.active::after { 
                        left: 32px; 
                    }
                    select { 
                        padding: 8px 12px; 
                        border: 1px solid #ced4da; 
                        border-radius: 4px; 
                        background: white;
                    }
                    .button-row { 
                        text-align: center; 
                        margin-top: 30px; 
                        padding-top: 20px; 
                        border-top: 1px solid #dee2e6;
                    }
                    .btn { 
                        padding: 10px 20px; 
                        margin: 0 10px; 
                        border: none; 
                        border-radius: 4px; 
                        cursor: pointer; 
                        font-size: 14px; 
                        transition: background 0.3s;
                    }
                    .btn-primary { 
                        background: #007acc; 
                        color: white; 
                    }
                    .btn-primary:hover { 
                        background: #0056b3; 
                    }
                    .btn-secondary { 
                        background: #6c757d; 
                        color: white; 
                    }
                    .btn-secondary:hover { 
                        background: #545b62; 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🚀 Laravel Enhanced Settings</h1>
                        <p>Configure your Laravel development experience</p>
                    </div>

                    <div class="section">
                        <h2>📍 Route Features</h2>
                        
                        <div class="setting-row">
                            <div class="setting-label">
                                <div class="setting-title">Route Inlay Hints</div>
                                <div class="setting-description">Show route information at the end of route lines</div>
                            </div>
                            <div class="toggle-switch ${config.get('inlayHints.routes.enabled', true) ? 'active' : ''}" 
                                 onclick="toggleSetting('inlayHints.routes.enabled', this)"></div>
                        </div>

                        <div class="setting-row">
                            <div class="setting-label">
                                <div class="setting-title">Controller CodeLens</div>
                                <div class="setting-description">Show route information above controller methods</div>
                            </div>
                            <div class="toggle-switch ${config.get('codeLens.controller.enabled', true) ? 'active' : ''}" 
                                 onclick="toggleSetting('codeLens.controller.enabled', this)"></div>
                        </div>

                        <div class="setting-row">
                            <div class="setting-label">
                                <div class="setting-title">Show Middleware</div>
                                <div class="setting-description">Display middleware information in route hints</div>
                            </div>
                            <div class="toggle-switch ${config.get('routes.showMiddleware', false) ? 'active' : ''}" 
                                 onclick="toggleSetting('routes.showMiddleware', this)"></div>
                        </div>

                        <div class="setting-row">
                            <div class="setting-label">
                                <div class="setting-title">Inlay Hint Style</div>
                                <div class="setting-description">Choose how route hints are displayed</div>
                            </div>
                            <select onchange="updateSetting('inlayHints.style', this.value)">
                                <option value="compact" ${config.get('inlayHints.style') === 'compact' ? 'selected' : ''}>Compact</option>
                                <option value="detailed" ${config.get('inlayHints.style') === 'detailed' ? 'selected' : ''}>Detailed</option>
                            </select>
                        </div>
                    </div>

                    <div class="section">
                        <h2>💡 Completion Features</h2>
                        
                        <div class="setting-row">
                            <div class="setting-label">
                                <div class="setting-title">Model Completion</div>
                                <div class="setting-description">Auto-complete model attributes and relationships</div>
                            </div>
                            <div class="toggle-switch ${config.get('completion.models.enabled', true) ? 'active' : ''}" 
                                 onclick="toggleSetting('completion.models.enabled', this)"></div>
                        </div>

                        <div class="setting-row">
                            <div class="setting-label">
                                <div class="setting-title">Request Field Completion</div>
                                <div class="setting-description">Auto-complete FormRequest fields with "Add All" option</div>
                            </div>
                            <div class="toggle-switch ${config.get('completion.requests.enabled', true) ? 'active' : ''}" 
                                 onclick="toggleSetting('completion.requests.enabled', this)"></div>
                        </div>

                        <div class="setting-row">
                            <div class="setting-label">
                                <div class="setting-title">View Completion</div>
                                <div class="setting-description">Auto-complete view names and variables</div>
                            </div>
                            <div class="toggle-switch ${config.get('completion.views.enabled', true) ? 'active' : ''}" 
                                 onclick="toggleSetting('completion.views.enabled', this)"></div>
                        </div>

                        <div class="setting-row">
                            <div class="setting-label">
                                <div class="setting-title">Translation Completion</div>
                                <div class="setting-description">Auto-complete translation keys</div>
                            </div>
                            <div class="toggle-switch ${config.get('completion.translations.enabled', true) ? 'active' : ''}" 
                                 onclick="toggleSetting('completion.translations.enabled', this)"></div>
                        </div>
                    </div>

                    <div class="section">
                        <h2>✅ Validation Features</h2>
                        
                        <div class="setting-row">
                            <div class="setting-label">
                                <div class="setting-title">Validation Rules Completion</div>
                                <div class="setting-description">Auto-complete Laravel validation rules</div>
                            </div>
                            <div class="toggle-switch ${config.get('validation.enabled', true) ? 'active' : ''}" 
                                 onclick="toggleSetting('validation.enabled', this)"></div>
                        </div>

                        <div class="setting-row">
                            <div class="setting-label">
                                <div class="setting-title">Smart Suggestions</div>
                                <div class="setting-description">Context-aware validation rule suggestions</div>
                            </div>
                            <div class="toggle-switch ${config.get('validation.smartSuggestions', true) ? 'active' : ''}" 
                                 onclick="toggleSetting('validation.smartSuggestions', this)"></div>
                        </div>

                        <div class="setting-row">
                            <div class="setting-label">
                                <div class="setting-title">Quick Combinations</div>
                                <div class="setting-description">Show quick rule combinations for common field types</div>
                            </div>
                            <div class="toggle-switch ${config.get('validation.quickCombinations', true) ? 'active' : ''}" 
                                 onclick="toggleSetting('validation.quickCombinations', this)"></div>
                        </div>
                    </div>

                    <div class="button-row">
                        <button class="btn btn-secondary" onclick="resetSettings()">Reset to Defaults</button>
                        <button class="btn btn-primary" onclick="window.close()">Done</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function toggleSetting(key, element) {
                        const isActive = element.classList.contains('active');
                        const newValue = !isActive;
                        
                        if (newValue) {
                            element.classList.add('active');
                        } else {
                            element.classList.remove('active');
                        }
                        
                        vscode.postMessage({
                            command: 'updateSetting',
                            key: key,
                            value: newValue
                        });
                    }

                    function updateSetting(key, value) {
                        vscode.postMessage({
                            command: 'updateSetting',
                            key: key,
                            value: value
                        });
                    }

                    function resetSettings() {
                        vscode.postMessage({
                            command: 'resetSettings'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }
}
exports.SettingsCommands = SettingsCommands;
//# sourceMappingURL=settingsCommands.js.map