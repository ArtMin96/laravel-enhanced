"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteCommands = exports.RouteHoverProvider = exports.EnhancedControllerCodeLensProvider = exports.EnhancedRouteInlayProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const settings_1 = require("../utils/settings");
// Enhanced version of RouteInlayProvider with configuration support
class EnhancedRouteInlayProvider {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.routes = new Map();
        this.controllerRoutes = new Map();
        this.middleware = new Map();
        this.parseAllRoutes();
        this.setupWatchers();
    }
    setupWatchers() {
        const routeWatcher = vscode.workspace.createFileSystemWatcher('**/routes/**/*.php');
        routeWatcher.onDidChange(() => this.parseAllRoutes());
        routeWatcher.onDidCreate(() => this.parseAllRoutes());
        routeWatcher.onDidDelete(() => this.parseAllRoutes());
        // Watch for settings changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('laravelEnhanced')) {
                // Refresh inlay hints when settings change
                vscode.commands.executeCommand('editor.action.refreshInlayHints');
            }
        });
    }
    parseAllRoutes() {
        this.routes.clear();
        this.controllerRoutes.clear();
        this.middleware.clear();
        const routesPath = path.join(this.workspaceRoot, 'routes');
        if (!fs.existsSync(routesPath))
            return;
        const routeFiles = fs.readdirSync(routesPath)
            .filter(file => file.endsWith('.php'));
        routeFiles.forEach(file => {
            const filePath = path.join(routesPath, file);
            this.parseRouteFile(filePath);
        });
        this.buildControllerRouteMap();
    }
    parseRouteFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            let currentMiddleware = [];
            let currentPrefix = '';
            let groupLevel = 0;
            lines.forEach((line, index) => {
                const lineNumber = index + 1;
                const trimmedLine = line.trim();
                // Handle route groups
                if (trimmedLine.includes('Route::group(')) {
                    groupLevel++;
                    this.parseRouteGroup(line, currentMiddleware, currentPrefix);
                }
                // Handle group closing
                if (trimmedLine === '});' && groupLevel > 0) {
                    groupLevel--;
                    // Reset middleware and prefix when exiting group
                    if (groupLevel === 0) {
                        currentMiddleware = [];
                        currentPrefix = '';
                    }
                }
                // Parse individual routes
                this.parseRouteLine(line, lineNumber, filePath, currentMiddleware, currentPrefix);
            });
        }
        catch (error) {
            console.error(`Error parsing route file ${filePath}:`, error);
        }
    }
    parseRouteGroup(line, currentMiddleware, currentPrefix) {
        // Extract group attributes
        const middlewareMatch = line.match(/'middleware'\s*=>\s*\[([^\]]+)\]/);
        if (middlewareMatch) {
            const middleware = middlewareMatch[1]
                .split(',')
                .map(m => m.trim().replace(/['"]/g, ''));
            currentMiddleware.push(...middleware);
        }
        const prefixMatch = line.match(/'prefix'\s*=>\s*['"]([^'"]+)['"]/);
        if (prefixMatch) {
            currentPrefix = prefixMatch[1];
        }
    }
    parseRouteLine(line, lineNumber, filePath, groupMiddleware, groupPrefix) {
        // Standard routes with controller@method
        let match = line.match(/Route::(get|post|put|patch|delete|options|head|any)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`@]+)@([^'"`]+)['"`]/);
        if (match) {
            const [, method, uri, controller, controllerMethod] = match;
            const fullUri = groupPrefix ? `${groupPrefix}/${uri}`.replace('//', '/') : uri;
            this.addRoute({
                method: [method.toUpperCase()],
                uri: fullUri,
                controller,
                controllerMethod,
                action: `${controller}@${controllerMethod}`,
                middleware: [...groupMiddleware, ...this.extractInlineMiddleware(line)],
                filePath,
                line: lineNumber,
                column: line.indexOf('Route::')
            });
        }
        // Routes with [Controller::class, 'method']
        match = line.match(/Route::(get|post|put|patch|delete|options|head|any)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\[\s*([^:]+)::class\s*,\s*['"`]([^'"`]+)['"`]\s*\]/);
        if (match) {
            const [, method, uri, controller, controllerMethod] = match;
            const fullUri = groupPrefix ? `${groupPrefix}/${uri}`.replace('//', '/') : uri;
            const shortController = controller.split('\\').pop() || controller;
            this.addRoute({
                method: [method.toUpperCase()],
                uri: fullUri,
                controller: shortController,
                controllerMethod,
                action: `${controller}@${controllerMethod}`,
                middleware: [...groupMiddleware, ...this.extractInlineMiddleware(line)],
                filePath,
                line: lineNumber,
                column: line.indexOf('Route::')
            });
        }
        // Resource routes
        match = line.match(/Route::(resource|apiResource)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([^:]+)::class/);
        if (match) {
            const [, resourceType, uri, controller] = match;
            const fullUri = groupPrefix ? `${groupPrefix}/${uri}`.replace('//', '/') : uri;
            const shortController = controller.split('\\').pop() || controller;
            const methods = resourceType === 'apiResource'
                ? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
                : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
            this.addRoute({
                method: methods,
                uri: `${fullUri}/{id?}`,
                controller: shortController,
                controllerMethod: 'resource',
                action: `${controller} (${resourceType})`,
                middleware: [...groupMiddleware, ...this.extractInlineMiddleware(line)],
                filePath,
                line: lineNumber,
                column: line.indexOf('Route::')
            });
        }
        // Closure routes
        match = line.match(/Route::(get|post|put|patch|delete|options|head|any)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*function/);
        if (match) {
            const [, method, uri] = match;
            const fullUri = groupPrefix ? `${groupPrefix}/${uri}`.replace('//', '/') : uri;
            this.addRoute({
                method: [method.toUpperCase()],
                uri: fullUri,
                action: 'Closure',
                middleware: [...groupMiddleware, ...this.extractInlineMiddleware(line)],
                filePath,
                line: lineNumber,
                column: line.indexOf('Route::')
            });
        }
        // Named routes
        const nameMatch = line.match(/->name\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
        if (nameMatch && this.routes.has(filePath)) {
            const routes = this.routes.get(filePath);
            const lastRoute = routes[routes.length - 1];
            if (lastRoute && Math.abs(lastRoute.line - lineNumber) <= 2) {
                lastRoute.name = nameMatch[1];
            }
        }
    }
    extractInlineMiddleware(line) {
        const middlewareMatch = line.match(/->middleware\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
        if (middlewareMatch) {
            return [middlewareMatch[1]];
        }
        const middlewareArrayMatch = line.match(/->middleware\s*\(\s*\[([^\]]+)\]/);
        if (middlewareArrayMatch) {
            return middlewareArrayMatch[1]
                .split(',')
                .map(m => m.trim().replace(/['"]/g, ''));
        }
        return [];
    }
    addRoute(route) {
        const key = route.filePath;
        if (!this.routes.has(key)) {
            this.routes.set(key, []);
        }
        this.routes.get(key).push(route);
    }
    buildControllerRouteMap() {
        this.routes.forEach(routes => {
            routes.forEach(route => {
                if (route.controller && route.controllerMethod) {
                    // Create multiple possible key combinations for better matching
                    const keys = [
                        `${route.controller}@${route.controllerMethod}`,
                    ];
                    // If controller doesn't end with 'Controller', try adding it
                    if (!route.controller.endsWith('Controller')) {
                        keys.push(`${route.controller}Controller@${route.controllerMethod}`);
                    }
                    // If controller ends with 'Controller', try without it
                    if (route.controller.endsWith('Controller')) {
                        const shortName = route.controller.replace('Controller', '');
                        keys.push(`${shortName}@${route.controllerMethod}`);
                        keys.push(`${shortName}Controller@${route.controllerMethod}`);
                    }
                    keys.forEach(key => {
                        if (!this.controllerRoutes.has(key)) {
                            this.controllerRoutes.set(key, []);
                        }
                        this.controllerRoutes.get(key).push(route);
                    });
                }
            });
        });
    }
    // Enhanced inlay hints with configuration support
    provideInlayHints(document, range) {
        if (!settings_1.LaravelSettings.inlayHintsEnabled) {
            return [];
        }
        const hints = [];
        if (!document.fileName.includes('/routes/')) {
            return hints;
        }
        const routes = this.routes.get(document.fileName) || [];
        const text = document.getText();
        const lines = text.split('\n');
        routes.forEach(route => {
            if (route.line >= range.start.line && route.line <= range.end.line) {
                const line = lines[route.line - 1];
                const routeMatch = line.match(/Route::/);
                if (routeMatch) {
                    const position = new vscode.Position(route.line - 1, line.length);
                    let hintText = ` // ${this.formatRouteHint(route)}`;
                    const hint = new vscode.InlayHint(position, hintText, vscode.InlayHintKind.Parameter);
                    hint.tooltip = this.createRouteTooltip(route);
                    // Color coding based on HTTP method
                    hint.textEdits = [];
                    hint.paddingLeft = true;
                    hints.push(hint);
                }
            }
        });
        return hints;
    }
    formatRouteHint(route) {
        const style = settings_1.LaravelSettings.inlayHintStyle;
        let hintText = '';
        if (style === 'compact') {
            hintText = `${route.method.join('|')} ${route.uri}`;
            if (route.name) {
                hintText += ` [${route.name}]`;
            }
            if (settings_1.LaravelSettings.showMiddleware && route.middleware && route.middleware.length > 0) {
                hintText += ` | ${route.middleware.join(', ')}`;
            }
        }
        else {
            // Detailed style
            hintText = `${route.method.join('|')} ${route.uri}`;
            if (route.name) {
                hintText += ` → ${route.name}`;
            }
            if (settings_1.LaravelSettings.showMiddleware && route.middleware && route.middleware.length > 0) {
                hintText += ` | ${route.middleware.join(', ')}`;
            }
            if (route.action && route.action !== 'Closure') {
                hintText += ` → ${route.action}`;
            }
        }
        return hintText;
    }
    createRouteTooltip(route) {
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`## Route Information\n\n`);
        tooltip.appendMarkdown(`**Methods:** ${route.method.join(', ')}\n\n`);
        tooltip.appendMarkdown(`**URI Pattern:** \`${route.uri}\`\n\n`);
        if (route.name) {
            tooltip.appendMarkdown(`**Route Name:** \`${route.name}\`\n\n`);
        }
        if (route.action) {
            tooltip.appendMarkdown(`**Action:** ${route.action}\n\n`);
        }
        if (route.middleware && route.middleware.length > 0) {
            tooltip.appendMarkdown(`**Middleware:** ${route.middleware.join(', ')}\n\n`);
        }
        // Add route parameters if any
        if (settings_1.LaravelSettings.showParameters) {
            const parameters = this.extractRouteParameters(route.uri);
            if (parameters.length > 0) {
                tooltip.appendMarkdown(`**Parameters:**\n`);
                parameters.forEach(param => {
                    tooltip.appendMarkdown(`- \`${param}\`\n`);
                });
                tooltip.appendMarkdown(`\n`);
            }
        }
        // Add example URLs
        tooltip.appendMarkdown(`**Example URLs:**\n`);
        const exampleUrls = this.generateExampleUrls(route.uri);
        exampleUrls.forEach(url => {
            tooltip.appendMarkdown(`- \`${url}\`\n`);
        });
        return tooltip;
    }
    extractRouteParameters(uri) {
        const paramRegex = /\{([^}]+)\}/g;
        const parameters = [];
        let match;
        while ((match = paramRegex.exec(uri)) !== null) {
            parameters.push(match[1]);
        }
        return parameters;
    }
    generateExampleUrls(uri) {
        const examples = [];
        if (uri.includes('{')) {
            // Generate example with sample values
            let exampleUri = uri;
            exampleUri = exampleUri.replace(/\{id\??\}/g, '123');
            exampleUri = exampleUri.replace(/\{slug\??\}/g, 'example-slug');
            exampleUri = exampleUri.replace(/\{[^}]+\??\}/g, 'value');
            examples.push(exampleUri);
            // If optional parameters, show without them too
            if (uri.includes('?}')) {
                let withoutOptional = uri.replace(/\{[^}]*\?\}/g, '');
                withoutOptional = withoutOptional.replace(/\/+$/, ''); // Remove trailing slashes
                if (withoutOptional !== exampleUri && withoutOptional) {
                    examples.push(withoutOptional);
                }
            }
        }
        else {
            examples.push(uri);
        }
        return examples;
    }
    // Public methods for external access
    getRoutesForController(controllerName, methodName) {
        const possibleKeys = [
            `${controllerName}@${methodName}`,
            `${controllerName.replace('Controller', '')}@${methodName}`,
            `${controllerName.replace('Controller', '')}Controller@${methodName}`,
        ];
        // If doesn't end with Controller, try adding it
        if (!controllerName.endsWith('Controller')) {
            possibleKeys.push(`${controllerName}Controller@${methodName}`);
        }
        for (const key of possibleKeys) {
            const routes = this.controllerRoutes.get(key);
            if (routes && routes.length > 0) {
                return routes;
            }
        }
        return [];
    }
    getAllRoutes() {
        const allRoutes = [];
        this.routes.forEach(routes => {
            allRoutes.push(...routes);
        });
        return allRoutes;
    }
    getRoutesByMethod(method) {
        return this.getAllRoutes().filter(route => route.method.includes(method.toUpperCase()));
    }
    searchRoutes(query) {
        const lowerQuery = query.toLowerCase();
        return this.getAllRoutes().filter(route => route.uri.toLowerCase().includes(lowerQuery) ||
            (route.name && route.name.toLowerCase().includes(lowerQuery)) ||
            (route.action && route.action.toLowerCase().includes(lowerQuery)));
    }
}
exports.EnhancedRouteInlayProvider = EnhancedRouteInlayProvider;
// Enhanced Controller CodeLens with settings
class EnhancedControllerCodeLensProvider {
    constructor(routeProvider) {
        this.routeProvider = routeProvider;
    }
    provideCodeLenses(document) {
        if (!settings_1.LaravelSettings.codeLensEnabled) {
            return [];
        }
        const codeLenses = [];
        // Only process controller files
        if (!document.fileName.includes('Controller') || !document.fileName.endsWith('.php')) {
            return codeLenses;
        }
        const text = document.getText();
        const lines = text.split('\n');
        // Extract controller name from file path
        const controllerName = this.extractControllerName(document.fileName);
        if (!controllerName)
            return codeLenses;
        // Find public functions (controller methods)
        lines.forEach((line, index) => {
            const methodMatch = line.match(/public\s+function\s+(\w+)\s*\(/);
            if (methodMatch) {
                const methodName = methodMatch[1];
                // Skip magic methods and common non-route methods
                if (this.isRouteMethod(methodName)) {
                    const routes = this.routeProvider.getRoutesForController(controllerName, methodName);
                    if (routes.length > 0) {
                        const position = new vscode.Position(index, 0);
                        routes.forEach((route, routeIndex) => {
                            const lens = new vscode.CodeLens(new vscode.Range(position, position));
                            let title = `${route.method.join('|')} ${route.uri}`;
                            if (route.name) {
                                title += ` [${route.name}]`;
                            }
                            if (settings_1.LaravelSettings.showMiddleware && route.middleware && route.middleware.length > 0) {
                                title += ` | ${route.middleware.join(', ')}`;
                            }
                            lens.command = {
                                title,
                                command: 'laravel.openRoute',
                                arguments: [route.filePath, route.line]
                            };
                            codeLenses.push(lens);
                        });
                    }
                }
            }
        });
        return codeLenses;
    }
    extractControllerName(filePath) {
        const fileName = path.basename(filePath, '.php');
        // Remove 'Controller' suffix if present
        if (fileName.endsWith('Controller')) {
            return fileName;
        }
        return null;
    }
    isRouteMethod(methodName) {
        // Skip common non-route methods
        const skipMethods = [
            '__construct', '__destruct', '__call', '__callStatic',
            '__get', '__set', '__isset', '__unset', '__sleep',
            '__wakeup', '__toString', '__invoke', '__set_state',
            '__clone', '__debugInfo'
        ];
        return !skipMethods.includes(methodName);
    }
}
exports.EnhancedControllerCodeLensProvider = EnhancedControllerCodeLensProvider;
// Enhanced route hover provider
class RouteHoverProvider {
    constructor(routeInlayProvider) {
        this.routeInlayProvider = routeInlayProvider;
    }
    provideHover(document, position) {
        const line = document.lineAt(position).text;
        // Check if hovering over a route definition
        const routeMatch = line.match(/Route::(get|post|put|patch|delete|options|head|any|resource|apiResource|match|group)/);
        if (routeMatch) {
            const allRoutes = this.routeInlayProvider.getAllRoutes();
            const currentRoute = allRoutes.find(route => route.filePath === document.fileName &&
                route.line === position.line + 1);
            if (currentRoute) {
                const content = new vscode.MarkdownString();
                content.appendMarkdown(`## Route Information\n\n`);
                content.appendMarkdown(`**Methods:** ${currentRoute.method.join(', ')}\n\n`);
                content.appendMarkdown(`**URI Pattern:** \`${currentRoute.uri}\`\n\n`);
                if (currentRoute.name) {
                    content.appendMarkdown(`**Route Name:** \`${currentRoute.name}\`\n\n`);
                }
                if (currentRoute.action) {
                    content.appendMarkdown(`**Action:** ${currentRoute.action}\n\n`);
                }
                // Add example URLs
                content.appendMarkdown(`**Example URLs:**\n`);
                if (currentRoute.uri.includes('{')) {
                    const exampleUri = currentRoute.uri.replace(/\{[^}]+\}/g, '1');
                    content.appendMarkdown(`- \`${exampleUri}\`\n`);
                }
                else {
                    content.appendMarkdown(`- \`${currentRoute.uri}\`\n`);
                }
                return new vscode.Hover(content);
            }
        }
        return undefined;
    }
}
exports.RouteHoverProvider = RouteHoverProvider;
// Commands for route navigation
class RouteCommands {
    static register(context, routeProvider) {
        // Open route definition from controller
        context.subscriptions.push(vscode.commands.registerCommand('laravel.openRoute', (filePath, line) => {
            vscode.workspace.openTextDocument(filePath).then(doc => {
                vscode.window.showTextDocument(doc).then(editor => {
                    const position = new vscode.Position(line - 1, 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(new vscode.Range(position, position));
                });
            });
        }));
        // Show all routes in a quick pick
        context.subscriptions.push(vscode.commands.registerCommand('laravel.showAllRoutes', () => {
            const routes = routeProvider.getAllRoutes();
            const items = routes.map(route => ({
                label: `${route.method.join('|')} ${route.uri}`,
                description: route.action || 'Closure',
                detail: route.name ? `Named: ${route.name}` : undefined,
                // Store route info in custom property
                route: route
            }));
            vscode.window.showQuickPick(items, {
                placeHolder: 'Select a route to navigate to',
                matchOnDescription: true,
                matchOnDetail: true
            }).then(selection => {
                if (selection && selection.route) {
                    const route = selection.route;
                    vscode.commands.executeCommand('laravel.openRoute', route.filePath, route.line);
                }
            });
        }));
        // Generate route list command
        context.subscriptions.push(vscode.commands.registerCommand('laravel.generateRouteList', () => {
            const routes = routeProvider.getAllRoutes();
            this.generateRouteListDocument(routes);
        }));
    }
    static generateRouteListDocument(routes) {
        const content = this.generateRouteListContent(routes);
        vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
        }).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    }
    static generateRouteListContent(routes) {
        let content = `# Laravel Routes\n\n`;
        content += `Generated on: ${new Date().toLocaleString()}\n\n`;
        content += `Total routes: ${routes.length}\n\n`;
        // Group routes by method
        const groupedRoutes = routes.reduce((groups, route) => {
            route.method.forEach(method => {
                if (!groups[method]) {
                    groups[method] = [];
                }
                groups[method].push(route);
            });
            return groups;
        }, {});
        Object.keys(groupedRoutes).sort().forEach(method => {
            content += `## ${method} Routes\n\n`;
            content += `| URI | Action | Name |\n`;
            content += `|-----|--------|------|\n`;
            groupedRoutes[method].forEach(route => {
                const action = route.action || 'Closure';
                const name = route.name || '-';
                content += `| \`${route.uri}\` | ${action} | ${name} |\n`;
            });
            content += `\n`;
        });
        return content;
    }
}
exports.RouteCommands = RouteCommands;
//# sourceMappingURL=enhancedRouteInlayProvider.js.map