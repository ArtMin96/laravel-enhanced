import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class RouteProvider {
    private routes: Map<string, RouteInfo> = new Map();
    
    constructor(private workspaceRoot: string) {
        this.parseRoutes();
    }
    
    private parseRoutes() {
        const routesPath = path.join(this.workspaceRoot, 'routes');
        if (!fs.existsSync(routesPath)) return;
        
        const routeFiles = ['web.php', 'api.php'];
        
        routeFiles.forEach(file => {
            const filePath = path.join(routesPath, file);
            if (fs.existsSync(filePath)) {
                this.parseRouteFile(filePath);
            }
        });
    }
    
    private parseRouteFile(filePath: string) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Simple regex to match route definitions
        const routeRegex = /Route::(get|post|put|patch|delete|any|match|resource)\s*\(\s*['"`]([^'"`]+)['"`]/g;
        
        let match;
        while ((match = routeRegex.exec(content)) !== null) {
            const [, method, uri] = match;
            this.routes.set(uri, {
                method,
                uri,
                filePath,
                line: content.substring(0, match.index).split('\n').length
            });
        }
    }
    
    getRoutes(): RouteInfo[] {
        return Array.from(this.routes.values());
    }
}

interface RouteInfo {
    method: string;
    uri: string;
    filePath: string;
    line: number;
}