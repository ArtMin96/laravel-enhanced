import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class LaravelDetector {
    /**
     * Check if the current workspace is a Laravel project
     */
    static isLaravelProject(workspacePath: string): boolean {
        if (!workspacePath) {
            return false;
        }

        // Check for artisan command file
        const artisanPath = path.join(workspacePath, 'artisan');
        if (!fs.existsSync(artisanPath)) {
            return false;
        }

        // Check for composer.json with Laravel framework dependency
        const composerPath = path.join(workspacePath, 'composer.json');
        if (!fs.existsSync(composerPath)) {
            return false;
        }

        try {
            const composerContent = fs.readFileSync(composerPath, 'utf8');
            const composer = JSON.parse(composerContent);
            
            // Check if Laravel framework is in dependencies
            const hasLaravel = composer.require && 
                             (composer.require['laravel/framework'] || 
                              composer.require['laravel/laravel']);
            
            if (hasLaravel) {
                return true;
            }

            // Additional check for Laravel-specific directories
            const laravelDirs = ['app', 'config', 'database', 'routes'];
            const existingDirs = laravelDirs.filter(dir => 
                fs.existsSync(path.join(workspacePath, dir))
            );

            // If we have most Laravel directories, consider it a Laravel project
            return existingDirs.length >= 3;

        } catch (error) {
            console.error('Error parsing composer.json:', error);
            return false;
        }
    }

    /**
     * Get Laravel version from composer.json
     */
    static getLaravelVersion(workspacePath: string): string | null {
        const composerPath = path.join(workspacePath, 'composer.json');
        
        if (!fs.existsSync(composerPath)) {
            return null;
        }

        try {
            const composerContent = fs.readFileSync(composerPath, 'utf8');
            const composer = JSON.parse(composerContent);
            
            if (composer.require && composer.require['laravel/framework']) {
                return composer.require['laravel/framework'];
            }

            return null;
        } catch (error) {
            console.error('Error reading Laravel version:', error);
            return null;
        }
    }

    /**
     * Check if specific Laravel features are available
     */
    static hasLaravelFeatures(workspacePath: string): {
        models: boolean;
        controllers: boolean;
        migrations: boolean;
        views: boolean;
        routes: boolean;
        translations: boolean;
        requests: boolean;
    } {
        return {
            models: fs.existsSync(path.join(workspacePath, 'app', 'Models')) || 
                   fs.existsSync(path.join(workspacePath, 'app')),
            controllers: fs.existsSync(path.join(workspacePath, 'app', 'Http', 'Controllers')),
            migrations: fs.existsSync(path.join(workspacePath, 'database', 'migrations')),
            views: fs.existsSync(path.join(workspacePath, 'resources', 'views')),
            routes: fs.existsSync(path.join(workspacePath, 'routes')),
            translations: fs.existsSync(path.join(workspacePath, 'lang')) || 
                         fs.existsSync(path.join(workspacePath, 'resources', 'lang')),
            requests: fs.existsSync(path.join(workspacePath, 'app', 'Http', 'Requests'))
        };
    }

    /**
     * Get Laravel project information
     */
    static getProjectInfo(workspacePath: string): {
        isLaravel: boolean;
        version: string | null;
        features: ReturnType<typeof LaravelDetector.hasLaravelFeatures>;
    } {
        const isLaravel = this.isLaravelProject(workspacePath);
        
        return {
            isLaravel,
            version: isLaravel ? this.getLaravelVersion(workspacePath) : null,
            features: isLaravel ? this.hasLaravelFeatures(workspacePath) : {
                models: false,
                controllers: false,
                migrations: false,
                views: false,
                routes: false,
                translations: false,
                requests: false
            }
        };
    }
}