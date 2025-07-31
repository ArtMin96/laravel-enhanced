import * as vscode from 'vscode';

export class LaravelSettings {
    private static readonly EXTENSION_ID = 'laravelEnhanced';

    // Route settings
    static get inlayHintsEnabled(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('inlayHints.routes.enabled', true);
    }

    static get codeLensEnabled(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('codeLens.controller.enabled', true);
    }

    static get showMiddleware(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('routes.showMiddleware', false);
    }

    static get showParameters(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('routes.showParameters', true);
    }

    static get inlayHintStyle(): 'compact' | 'detailed' {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('inlayHints.style', 'compact');
    }

    // Completion settings
    static get modelsEnabled(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('completion.models.enabled', true);
    }

    static get viewsEnabled(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('completion.views.enabled', true);
    }

    static get requestsEnabled(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('completion.requests.enabled', true);
    }

    static get translationsEnabled(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('completion.translations.enabled', true);
    }

    // Validation settings
    static get validationEnabled(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('validation.enabled', true);
    }

    static get validationShowDescriptions(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('validation.showDescriptions', true);
    }

    static get validationSmartSuggestions(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('validation.smartSuggestions', true);
    }

    static get validationQuickCombinations(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('validation.quickCombinations', true);
    }

    // Diagnostics settings
    static get diagnosticsEnabled(): boolean {
        return vscode.workspace.getConfiguration(this.EXTENSION_ID)
            .get('diagnostics.enabled', true);
    }

    // Helper method to update settings
    static async updateSetting(key: string, value: any, target?: vscode.ConfigurationTarget): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.EXTENSION_ID);
        await config.update(key, value, target || vscode.ConfigurationTarget.Workspace);
    }

    // Get all settings as object
    static getAllSettings(): Record<string, any> {
        const config = vscode.workspace.getConfiguration(this.EXTENSION_ID);
        return {
            // Route settings
            'inlayHints.routes.enabled': config.get('inlayHints.routes.enabled'),
            'codeLens.controller.enabled': config.get('codeLens.controller.enabled'),
            'routes.showMiddleware': config.get('routes.showMiddleware'),
            'routes.showParameters': config.get('routes.showParameters'),
            'inlayHints.style': config.get('inlayHints.style'),
            
            // Completion settings
            'completion.models.enabled': config.get('completion.models.enabled'),
            'completion.views.enabled': config.get('completion.views.enabled'),
            'completion.requests.enabled': config.get('completion.requests.enabled'),
            'completion.translations.enabled': config.get('completion.translations.enabled'),
            
            // Validation settings
            'validation.enabled': config.get('validation.enabled'),
            'validation.showDescriptions': config.get('validation.showDescriptions'),
            'validation.smartSuggestions': config.get('validation.smartSuggestions'),
            'validation.quickCombinations': config.get('validation.quickCombinations'),
            
            // Diagnostics settings
            'diagnostics.enabled': config.get('diagnostics.enabled')
        };
    }

    // Reset all settings to defaults
    static async resetToDefaults(): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.EXTENSION_ID);
        const settings = this.getAllSettings();
        
        for (const key of Object.keys(settings)) {
            await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
        }
    }
}