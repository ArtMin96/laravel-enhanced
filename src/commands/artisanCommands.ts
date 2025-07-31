import * as vscode from 'vscode';
import * as path from 'path';

export class ArtisanCommands {
    static register(context: vscode.ExtensionContext) {
        // Make Model command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.makeModel', async () => {
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter model name',
                    placeHolder: 'User',
                    validateInput: (value: string) => {
                        if (!value || value.trim().length === 0) {
                            return 'Model name is required';
                        }
                        if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
                            return 'Model name must start with uppercase letter and contain only letters and numbers';
                        }
                        return null;
                    }
                });
                
                if (name) {
                    const options = await vscode.window.showQuickPick([
                        { label: 'Model only', description: 'Create just the model', value: '' },
                        { label: 'Model with migration', description: 'Create model with migration (-m)', value: '-m' },
                        { label: 'Model with controller', description: 'Create model with controller (-c)', value: '-c' },
                        { label: 'Model with factory', description: 'Create model with factory (-f)', value: '-f' },
                        { label: 'All (model, migration, controller, factory)', description: 'Create everything (-mcf)', value: '-mcf' }
                    ], {
                        placeHolder: 'Select what to generate'
                    });

                    if (options) {
                        await this.runArtisan(`make:model ${name} ${options.value}`.trim());
                    }
                }
            })
        );
        
        // Make Controller command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.makeController', async () => {
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter controller name',
                    placeHolder: 'UserController',
                    validateInput: (value: string) => {
                        if (!value || value.trim().length === 0) {
                            return 'Controller name is required';
                        }
                        if (!/^[A-Z][a-zA-Z0-9]*Controller$/.test(value)) {
                            return 'Controller name must start with uppercase letter and end with "Controller"';
                        }
                        return null;
                    }
                });
                
                if (name) {
                    const options = await vscode.window.showQuickPick([
                        { label: 'Controller only', description: 'Create just the controller', value: '' },
                        { label: 'Resource controller', description: 'Create resource controller (-r)', value: '-r' },
                        { label: 'API resource controller', description: 'Create API resource controller (--api)', value: '--api' },
                        { label: 'Controller with model', description: 'Create controller with model (-m)', value: '-m' },
                        { label: 'Invokable controller', description: 'Create single action controller (-i)', value: '-i' }
                    ], {
                        placeHolder: 'Select controller type'
                    });

                    if (options) {
                        await this.runArtisan(`make:controller ${name} ${options.value}`.trim());
                    }
                }
            })
        );

        // Make Migration command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.makeMigration', async () => {
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter migration name',
                    placeHolder: 'create_users_table',
                    validateInput: (value: string) => {
                        if (!value || value.trim().length === 0) {
                            return 'Migration name is required';
                        }
                        return null;
                    }
                });
                
                if (name) {
                    await this.runArtisan(`make:migration ${name}`);
                }
            })
        );

        // Make Request command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.makeRequest', async () => {
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter request name',
                    placeHolder: 'StoreUserRequest',
                    validateInput: (value: string) => {
                        if (!value || value.trim().length === 0) {
                            return 'Request name is required';
                        }
                        if (!/^[A-Z][a-zA-Z0-9]*Request$/.test(value)) {
                            return 'Request name must start with uppercase letter and end with "Request"';
                        }
                        return null;
                    }
                });
                
                if (name) {
                    await this.runArtisan(`make:request ${name}`);
                }
            })
        );

        // Make Middleware command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.makeMiddleware', async () => {
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter middleware name',
                    placeHolder: 'EnsureTokenIsValid',
                    validateInput: (value: string) => {
                        if (!value || value.trim().length === 0) {
                            return 'Middleware name is required';
                        }
                        return null;
                    }
                });
                
                if (name) {
                    await this.runArtisan(`make:middleware ${name}`);
                }
            })
        );

        // Make Seeder command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.makeSeeder', async () => {
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter seeder name',
                    placeHolder: 'UserSeeder',
                    validateInput: (value: string) => {
                        if (!value || value.trim().length === 0) {
                            return 'Seeder name is required';
                        }
                        if (!/^[A-Z][a-zA-Z0-9]*Seeder$/.test(value)) {
                            return 'Seeder name must start with uppercase letter and end with "Seeder"';
                        }
                        return null;
                    }
                });
                
                if (name) {
                    await this.runArtisan(`make:seeder ${name}`);
                }
            })
        );

        // Make Factory command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.makeFactory', async () => {
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter factory name',
                    placeHolder: 'UserFactory',
                    validateInput: (value: string) => {
                        if (!value || value.trim().length === 0) {
                            return 'Factory name is required';
                        }
                        if (!/^[A-Z][a-zA-Z0-9]*Factory$/.test(value)) {
                            return 'Factory name must start with uppercase letter and end with "Factory"';
                        }
                        return null;
                    }
                });
                
                if (name) {
                    await this.runArtisan(`make:factory ${name}`);
                }
            })
        );

        // Migrate command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.migrate', async () => {
                const options = await vscode.window.showQuickPick([
                    { label: 'Run migrations', description: 'php artisan migrate', value: 'migrate' },
                    { label: 'Run migrations (fresh)', description: 'php artisan migrate:fresh', value: 'migrate:fresh' },
                    { label: 'Rollback migrations', description: 'php artisan migrate:rollback', value: 'migrate:rollback' },
                    { label: 'Reset migrations', description: 'php artisan migrate:reset', value: 'migrate:reset' },
                    { label: 'Refresh migrations', description: 'php artisan migrate:refresh', value: 'migrate:refresh' }
                ], {
                    placeHolder: 'Select migration command'
                });

                if (options) {
                    await this.runArtisan(options.value);
                }
            })
        );

        // Clear cache commands
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.clearCache', async () => {
                const options = await vscode.window.showQuickPick([
                    { label: 'Clear application cache', description: 'php artisan cache:clear', value: 'cache:clear' },
                    { label: 'Clear config cache', description: 'php artisan config:clear', value: 'config:clear' },
                    { label: 'Clear route cache', description: 'php artisan route:clear', value: 'route:clear' },
                    { label: 'Clear view cache', description: 'php artisan view:clear', value: 'view:clear' },
                    { label: 'Clear all caches', description: 'Clear all cache types', value: 'clear:all' }
                ], {
                    placeHolder: 'Select cache to clear'
                });

                if (options) {
                    if (options.value === 'clear:all') {
                        await this.runArtisan('cache:clear');
                        await this.runArtisan('config:clear');
                        await this.runArtisan('route:clear');
                        await this.runArtisan('view:clear');
                        vscode.window.showInformationMessage('All caches cleared successfully!');
                    } else {
                        await this.runArtisan(options.value);
                    }
                }
            })
        );

        // Custom Artisan command
        context.subscriptions.push(
            vscode.commands.registerCommand('laravel.customArtisan', async () => {
                const command = await vscode.window.showInputBox({
                    prompt: 'Enter Artisan command (without "php artisan")',
                    placeHolder: 'route:list',
                    validateInput: (value: string) => {
                        if (!value || value.trim().length === 0) {
                            return 'Command is required';
                        }
                        return null;
                    }
                });
                
                if (command) {
                    await this.runArtisan(command);
                }
            })
        );
    }
    
    private static async runArtisan(command: string): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        // Check if artisan file exists
        const artisanPath = path.join(workspaceFolder.uri.fsPath, 'artisan');
        if (!require('fs').existsSync(artisanPath)) {
            vscode.window.showErrorMessage('Artisan command not found. Make sure you are in a Laravel project.');
            return;
        }

        // Create and show terminal
        const terminal = vscode.window.createTerminal({
            name: 'Laravel Artisan',
            cwd: workspaceFolder.uri.fsPath
        });
        
        terminal.sendText(`php artisan ${command}`);
        terminal.show();

        // Show success message for certain commands
        const successCommands = ['make:', 'migrate', 'cache:clear', 'config:clear', 'route:clear', 'view:clear'];
        if (successCommands.some(cmd => command.startsWith(cmd))) {
            setTimeout(() => {
                vscode.window.showInformationMessage(`✅ Artisan command executed: ${command}`);
            }, 1000);
        }
    }

    // Helper method to get common Artisan commands for quick access
    static getQuickCommands(): Array<{label: string, description: string, command: string}> {
        return [
            { label: 'Make Model', description: 'Create a new Eloquent model', command: 'laravel.makeModel' },
            { label: 'Make Controller', description: 'Create a new controller', command: 'laravel.makeController' },
            { label: 'Make Migration', description: 'Create a new migration', command: 'laravel.makeMigration' },
            { label: 'Make Request', description: 'Create a new form request', command: 'laravel.makeRequest' },
            { label: 'Make Middleware', description: 'Create a new middleware', command: 'laravel.makeMiddleware' },
            { label: 'Run Migrations', description: 'Execute database migrations', command: 'laravel.migrate' },
            { label: 'Clear Cache', description: 'Clear application caches', command: 'laravel.clearCache' },
            { label: 'Custom Command', description: 'Run any Artisan command', command: 'laravel.customArtisan' }
        ];
    }
}