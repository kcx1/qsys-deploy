import * as vscode from 'vscode';
import * as net from 'net';

// Interface definitions
interface QSysCore {
    name: string;
    ip: string;
    username?: string;
    password?: string;
    scripts: ScriptMapping[];
}

interface ScriptMapping {
    filePath: string;
    componentName: string;
    autoDeployOnSave?: boolean;
}

interface Component {
    Name: string;
    ID: string;
    Type: string;
}

// QRC Client for communicating with Q-SYS Core
class QrcClient {
    private socket: net.Socket | null = null;
    private responseCallbacks: Map<number, (response: any) => void> = new Map();
    private messageId: number = 1;
    private buffer: string = '';
    private outputChannel: vscode.OutputChannel;

    constructor(private ip: string, private port: number = 1710, outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    // Connect to the Q-SYS Core
    public connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.outputChannel.appendLine(`Connecting to Q-SYS Core at ${this.ip}:${this.port}...`);
            this.socket = new net.Socket();
            
            // Use a raw buffer to handle binary data properly
            let rawBuffer = Buffer.alloc(0);
            
            this.socket.on('data', (data: Buffer) => {
                // Log the raw data as hex for debugging
                this.outputChannel.appendLine(`Received raw data (${data.length} bytes): ${this.bufferToHexString(data)}`);
                
                // Append to our raw buffer
                rawBuffer = Buffer.concat([rawBuffer, data]);
                
                // Process the buffer
                this.processRawBuffer(rawBuffer).then(remainingBuffer => {
                    rawBuffer = remainingBuffer;
                });
            });
            
            this.socket.on('error', (err) => {
                this.outputChannel.appendLine(`Connection error: ${err.message}`);
                vscode.window.showErrorMessage(`Q-SYS Connection Error: ${err.message}`);
                reject(err);
            });
            
            this.socket.connect(this.port, this.ip, () => {
                this.outputChannel.appendLine(`Connected to Q-SYS Core at ${this.ip}`);
                vscode.window.showInformationMessage(`Connected to Q-SYS Core at ${this.ip}`);
                resolve();
            });
        });
    }

    // Close the connection
    public disconnect(): void {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
    }
    
    // Convert buffer to hex string for debugging
    private bufferToHexString(buffer: Buffer): string {
        let result = '';
        for (let i = 0; i < buffer.length; i++) {
            const byte = buffer[i];
            // Show printable ASCII characters as-is, others as hex
            if (byte >= 32 && byte <= 126) {
                result += String.fromCharCode(byte);
            } else if (byte === 0) {
                result += '\\0'; // NULL character
            } else if (byte === 10) {
                result += '\\n'; // Newline
            } else if (byte === 13) {
                result += '\\r'; // Carriage return
            } else {
                result += `\\x${byte.toString(16).padStart(2, '0')}`;
            }
        }
        return result;
    }

    // Process the raw buffer and extract JSON messages
    private async processRawBuffer(buffer: Buffer): Promise<Buffer> {
        let currentPosition = 0;
        let messageStart = 0;
        
        // Scan through the buffer looking for message boundaries
        while (currentPosition < buffer.length) {
            // Look for NULL character or newline as message delimiter
            if (buffer[currentPosition] === 0 || buffer[currentPosition] === 10) {
                if (currentPosition > messageStart) {
                    // Extract the message
                    const messageBuffer = buffer.slice(messageStart, currentPosition);
                    const messageStr = messageBuffer.toString().trim();
                    
                    if (messageStr.length > 0) {
                        const delimiterType = buffer[currentPosition] === 0 ? "NULL" : "newline";
                        this.outputChannel.appendLine(`Found message with ${delimiterType} delimiter at position ${currentPosition}`);
                        this.outputChannel.appendLine(`Message content: ${messageStr}`);
                        
                        // Process the message
                        await this.processMessage(messageStr);
                    }
                }
                
                // Move past this delimiter to start of next message
                messageStart = currentPosition + 1;
            }
            
            currentPosition++;
        }
        
        // Return any unprocessed data
        return buffer.slice(messageStart);
    }
    
    // Process a JSON message
    private async processMessage(message: string): Promise<void> {
        try {
            // Check if the message starts with a valid JSON character
            if (message.startsWith('{') || message.startsWith('[')) {
                this.outputChannel.appendLine(`Parsing JSON message: ${message}`);
                const response = JSON.parse(message);
                
                // Handle responses to our commands (with ID)
                if (response.id && this.responseCallbacks.has(response.id)) {
                    this.outputChannel.appendLine(`Found callback for ID ${response.id}`);
                    const callback = this.responseCallbacks.get(response.id);
                    if (callback) {
                        callback(response);
                        this.responseCallbacks.delete(response.id);
                    }
                } 
                // Handle unsolicited messages (like EngineStatus)
                else if (response.method) {
                    this.outputChannel.appendLine(`Received unsolicited message: ${response.method}`);
                    // You might want to handle specific unsolicited messages here
                }
            } else {
                this.outputChannel.appendLine(`Skipping non-JSON message: ${message}`);
            }
        } catch (err) {
            this.outputChannel.appendLine(`Error parsing QRC response: ${err}`);
            console.error('Error parsing QRC response:', err);
        }
    }

    // Send a command to the Q-SYS Core
    public sendCommand(method: string, params: any[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                const error = 'Not connected to Q-SYS Core';
                this.outputChannel.appendLine(`Error: ${error}`);
                reject(new Error(error));
                return;
            }
            
            const id = this.messageId++;
            const command = {
                jsonrpc: '2.0',
                method,
                params,
                id
            };
            
            const commandStr = JSON.stringify(command);
            this.outputChannel.appendLine(`Sending command: ${commandStr}`);
            
            this.responseCallbacks.set(id, (response) => {
                this.outputChannel.appendLine(`Received response for command ${id}: ${JSON.stringify(response)}`);
                if (response.error) {
                    reject(new Error(response.error.message || 'Unknown error'));
                } else {
                    resolve(response.result);
                }
            });
            
            // Send with NULL terminator instead of newline, as per QRC protocol
            this.socket.write(commandStr + '\0');
        });
    }

    // Login to the Q-SYS Core
    public async login(username: string, password: string): Promise<void> {
        try {
            await this.sendCommand('login', [username, password]);
        } catch (err) {
            throw new Error(`Authentication failed: ${err}`);
        }
    }

    // Get all components
    public async getComponents(): Promise<Component[]> {
        try {
            const result = await this.sendCommand('Component.GetComponents');
            this.outputChannel.appendLine(`GetComponents result: ${JSON.stringify(result)}`);
            
            // The result is directly an array of components
            if (Array.isArray(result)) {
                this.outputChannel.appendLine(`Result is an array with ${result.length} components`);
                return result;
            }
            
            // Or it might be in a Components property
            if (result.Components && Array.isArray(result.Components)) {
                this.outputChannel.appendLine(`Result has Components array with ${result.Components.length} components`);
                return result.Components;
            }
            
            // If neither, log an error and return empty array
            this.outputChannel.appendLine(`Unexpected GetComponents response format: ${JSON.stringify(result)}`);
            return [];
        } catch (err) {
            this.outputChannel.appendLine(`Error getting components: ${err}`);
            throw new Error(`Failed to get components: ${err}`);
        }
    }

    // Set script content for a component
    public async setScript(componentName: string, scriptContent: string): Promise<void> {
        try {
            // Format the command according to the QRC protocol specification
            const params = {
                Name: componentName,
                Controls: [
                    {
                        Name: "code",
                        Value: scriptContent
                    }
                ]
            };
            
            this.outputChannel.appendLine(`Setting script for component "${componentName}" with params: ${JSON.stringify(params)}`);
            await this.sendCommand('Component.Set', [params]);
        } catch (err) {
            this.outputChannel.appendLine(`Error setting script: ${err}`);
            throw new Error(`Failed to set script: ${err}`);
        }
    }

    // Get script content from a component
    public async getScript(componentName: string): Promise<string> {
        try {
            // Format the command according to the QRC protocol specification
            const params = {
                Name: componentName,
                Controls: ["code"]
            };
            
            this.outputChannel.appendLine(`Getting script from component "${componentName}"`);
            const result = await this.sendCommand('Component.Get', [params]);
            
            // Extract the script content from the response
            if (result && result.Controls && result.Controls.length > 0) {
                const codeControl = result.Controls.find((c: any) => c.Name === "code");
                if (codeControl && codeControl.Value) {
                    return codeControl.Value;
                }
            }
            
            this.outputChannel.appendLine(`No script content found in response: ${JSON.stringify(result)}`);
            return '';
        } catch (err) {
            this.outputChannel.appendLine(`Error getting script: ${err}`);
            throw new Error(`Failed to get script: ${err}`);
        }
    }
}

// Extension activation
export function activate(context: vscode.ExtensionContext) {
    console.log('Q-SYS Deploy extension is now active');
    
    // Create output channel for debugging
    const outputChannel = vscode.window.createOutputChannel('Q-SYS Deploy');
    outputChannel.appendLine('Q-SYS Deploy extension activated');
    context.subscriptions.push(outputChannel);
    
    // Status bar item to show current connection status
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = 'Q-SYS: Not Connected';
    statusBarItem.command = 'qsys-deploy.testConnection';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    
    // Command to show debug output
    const showDebugOutputCommand = vscode.commands.registerCommand('qsys-deploy.showDebugOutput', () => {
        outputChannel.show();
    });
    context.subscriptions.push(showDebugOutputCommand);
    
    // Get extension settings
    function getSettings() {
        const config = vscode.workspace.getConfiguration('qsys-deploy');
        return {
            autoDeployOnSave: config.get<boolean>('autoDeployOnSave', false),
            cores: config.get<QSysCore[]>('cores', []),
            defaultCore: config.get<string>('defaultCore', '')
        };
    }
    
    // Update status bar
    function updateStatusBar(connected: boolean, coreName?: string) {
        if (connected && coreName) {
            statusBarItem.text = `Q-SYS: Connected to ${coreName}`;
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            statusBarItem.text = 'Q-SYS: Not Connected';
            statusBarItem.backgroundColor = undefined;
        }
    }
    
    // Find script mapping for a file
    function findScriptMapping(filePath: string): { core: QSysCore, mapping: ScriptMapping } | undefined {
        const settings = getSettings();
        
        for (const core of settings.cores) {
            for (const mapping of core.scripts) {
                // Normalize paths for comparison
                const normalizedFilePath = vscode.workspace.asRelativePath(filePath);
                const normalizedMappingPath = vscode.workspace.asRelativePath(mapping.filePath);
                
                if (normalizedFilePath === normalizedMappingPath) {
                    return { core, mapping };
                }
            }
        }
        
        return undefined;
    }
    
    // Validate component type
    async function validateComponent(client: QrcClient, componentName: string): Promise<boolean> {
        try {
            outputChannel.appendLine(`Validating component with name: "${componentName}"`);
            
            const components = await client.getComponents();
            outputChannel.appendLine(`Got ${components.length} components`);
            
            // Log all components for debugging
            outputChannel.appendLine("=== All Components ===");
            components.forEach((comp, index) => {
                outputChannel.appendLine(`Component ${index + 1}:`);
                outputChannel.appendLine(`  Name: "${comp.Name || 'undefined'}"`);
                outputChannel.appendLine(`  ID: "${comp.ID || 'undefined'}"`);
                outputChannel.appendLine(`  Type: "${comp.Type || 'undefined'}"`);
            });
            outputChannel.appendLine("=====================");
            
            // Try to find by Name or ID
            outputChannel.appendLine(`Looking for component with Name or ID matching "${componentName}"`);
            
            // Debug each component match attempt
            let matchFound = false;
            let matchedComponent = null;
            
            for (const comp of components) {
                outputChannel.appendLine(`Checking component - Name: "${comp.Name}", ID: "${comp.ID}"`);
                
                if (comp.Name === componentName) {
                    outputChannel.appendLine(`✓ Match found by Name: "${comp.Name}"`);
                    matchFound = true;
                    matchedComponent = comp;
                    break;
                } else if (comp.ID === componentName) {
                    outputChannel.appendLine(`✓ Match found by ID: "${comp.ID}"`);
                    matchFound = true;
                    matchedComponent = comp;
                    break;
                } else {
                    outputChannel.appendLine(`✗ No match`);
                }
            }
            
            if (!matchFound || !matchedComponent) {
                outputChannel.appendLine(`Component "${componentName}" not found in the list of components`);
                vscode.window.showErrorMessage(`Component "${componentName}" not found`);
                return false;
            }
            
            outputChannel.appendLine(`Found component: ${JSON.stringify(matchedComponent)}`);
            
            const validTypes = ['device_controller_script', 'control_script_2', 'scriptable_controls'];
            if (!validTypes.includes(matchedComponent.Type)) {
                outputChannel.appendLine(`Component type "${matchedComponent.Type}" is not valid. Valid types: ${validTypes.join(', ')}`);
                vscode.window.showErrorMessage(`Component "${componentName}" is not a valid script component type. Must be one of: ${validTypes.join(', ')}`);
                return false;
            }
            
            outputChannel.appendLine(`Component "${componentName}" is valid with type "${matchedComponent.Type}"`);
            return true;
        } catch (err) {
            outputChannel.appendLine(`Error validating component: ${err}`);
            vscode.window.showErrorMessage(`Error validating component: ${err}`);
            return false;
        }
    }
    
    // Deploy script to Q-SYS Core
    async function deployScript(filePath: string, core: QSysCore, componentName: string): Promise<boolean> {
        outputChannel.appendLine(`\n--- Starting deployment to ${core.name} (${core.ip}) ---`);
        outputChannel.appendLine(`Component: ${componentName}`);
        outputChannel.appendLine(`File: ${filePath}`);
        
        const client = new QrcClient(core.ip, 1710, outputChannel);
        
        try {
            // Connect to the core
            outputChannel.appendLine('Connecting to core...');
            await client.connect();
            
            // Authenticate if credentials are provided
            if (core.username && core.password) {
                outputChannel.appendLine('Authenticating...');
                await client.login(core.username, core.password);
                outputChannel.appendLine('Authentication successful');
            }
            
            // Validate component
            outputChannel.appendLine(`Validating component "${componentName}"...`);
            const isValid = await validateComponent(client, componentName);
            if (!isValid) {
                outputChannel.appendLine('Component validation failed');
                client.disconnect();
                return false;
            }
            outputChannel.appendLine('Component validation successful');
            
            // Get script content
            outputChannel.appendLine('Reading script content...');
            const document = await vscode.workspace.openTextDocument(filePath);
            const scriptContent = document.getText();
            outputChannel.appendLine(`Script content length: ${scriptContent.length} characters`);
            
            // Deploy script
            outputChannel.appendLine('Deploying script...');
            await client.setScript(componentName, scriptContent);
            
            outputChannel.appendLine('Deployment successful');
            vscode.window.showInformationMessage(`Script deployed to ${componentName} on ${core.name}`);
            updateStatusBar(true, core.name);
            
            // Disconnect
            client.disconnect();
            outputChannel.appendLine('Disconnected from core');
            return true;
        } catch (err) {
            outputChannel.appendLine(`Deployment failed: ${err}`);
            vscode.window.showErrorMessage(`Deployment failed: ${err}`);
            updateStatusBar(false);
            client.disconnect();
            outputChannel.appendLine('Disconnected from core');
            return false;
        }
    }
    
    // Command: Deploy current script
    const deployCurrentScriptCommand = vscode.commands.registerCommand('qsys-deploy.deployCurrentScript', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }
        
        const filePath = editor.document.uri.fsPath;
        const scriptMapping = findScriptMapping(filePath);
        
        if (scriptMapping) {
            // Use existing mapping
            await deployScript(filePath, scriptMapping.core, scriptMapping.mapping.componentName);
        } else {
            // No mapping found, ask user to create one
            const settings = getSettings();
            
            if (settings.cores.length === 0) {
                const addCore = await vscode.window.showErrorMessage('No cores configured. Would you like to add one?', 'Add Core');
                if (addCore === 'Add Core') {
                    vscode.commands.executeCommand('qsys-deploy.addCore');
                }
                return;
            }
            
            const coreItems = settings.cores.map(core => ({
                label: core.name,
                description: core.ip,
                core
            }));
            
            const selectedCore = await vscode.window.showQuickPick(coreItems, {
                placeHolder: 'Select a Q-SYS Core'
            });
            
            if (!selectedCore) {
                return;
            }
            
            const componentName = await vscode.window.showInputBox({
                prompt: 'Enter component name',
                placeHolder: 'e.g., MainController'
            });
            
            if (!componentName) {
                return;
            }
            
            // Deploy script
            const success = await deployScript(filePath, selectedCore.core, componentName);
            
            if (success) {
                // Ask if user wants to save this mapping
                const saveMapping = await vscode.window.showInformationMessage(
                    'Script deployed successfully. Would you like to save this mapping?',
                    'Save Mapping'
                );
                
                if (saveMapping === 'Save Mapping') {
                    // Add mapping to configuration
                    const config = vscode.workspace.getConfiguration('qsys-deploy');
                    const cores = config.get<QSysCore[]>('cores', []);
                    
                    const coreIndex = cores.findIndex(c => c.name === selectedCore.core.name);
                    if (coreIndex !== -1) {
                        const normalizedFilePath = vscode.workspace.asRelativePath(filePath);
                        
                        cores[coreIndex].scripts.push({
                            filePath: normalizedFilePath,
                            componentName
                        });
                        
                        await config.update('cores', cores, vscode.ConfigurationTarget.Workspace);
                        vscode.window.showInformationMessage('Script mapping saved');
                    }
                }
            }
        }
    });
    
    // Command: Add core configuration
    const addCoreCommand = vscode.commands.registerCommand('qsys-deploy.addCore', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter a name for the core',
            placeHolder: 'e.g., Main Auditorium'
        });
        
        if (!name) {
            return;
        }
        
        const ip = await vscode.window.showInputBox({
            prompt: 'Enter the IP address of the core',
            placeHolder: 'e.g., 192.168.1.100'
        });
        
        if (!ip) {
            return;
        }
        
        const useAuth = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Use authentication?'
        });
        
        let username, password;
        
        if (useAuth === 'Yes') {
            username = await vscode.window.showInputBox({
                prompt: 'Enter username',
                placeHolder: 'e.g., admin'
            });
            
            if (!username) {
                return;
            }
            
            password = await vscode.window.showInputBox({
                prompt: 'Enter password',
                password: true
            });
            
            if (!password) {
                return;
            }
        }
        
        // Add core to configuration
        const config = vscode.workspace.getConfiguration('qsys-deploy');
        const cores = config.get<QSysCore[]>('cores', []);
        
        cores.push({
            name,
            ip,
            username,
            password,
            scripts: []
        });
        
        await config.update('cores', cores, vscode.ConfigurationTarget.Workspace);
        
        // Set as default if it's the first core
        if (cores.length === 1) {
            await config.update('defaultCore', name, vscode.ConfigurationTarget.Workspace);
        }
        
        vscode.window.showInformationMessage(`Core "${name}" added`);
        
        // Test connection
        const testConnection = await vscode.window.showInformationMessage(
            'Would you like to test the connection?',
            'Test Connection'
        );
        
        if (testConnection === 'Test Connection') {
            vscode.commands.executeCommand('qsys-deploy.testConnection');
        }
    });
    
    // Command: Remove core configuration
    const removeCoreCommand = vscode.commands.registerCommand('qsys-deploy.removeCore', async () => {
        const settings = getSettings();
        
        if (settings.cores.length === 0) {
            vscode.window.showErrorMessage('No cores configured');
            return;
        }
        
        const coreItems = settings.cores.map(core => ({
            label: core.name,
            description: core.ip
        }));
        
        const selectedCore = await vscode.window.showQuickPick(coreItems, {
            placeHolder: 'Select a core to remove'
        });
        
        if (!selectedCore) {
            return;
        }
        
        // Remove core from configuration
        const config = vscode.workspace.getConfiguration('qsys-deploy');
        const cores = settings.cores.filter(core => core.name !== selectedCore.label);
        
        await config.update('cores', cores, vscode.ConfigurationTarget.Workspace);
        
        // Update default core if needed
        if (settings.defaultCore === selectedCore.label) {
            await config.update('defaultCore', cores.length > 0 ? cores[0].name : '', vscode.ConfigurationTarget.Workspace);
        }
        
        vscode.window.showInformationMessage(`Core "${selectedCore.label}" removed`);
    });
    
    // Command: Map script to component
    const mapScriptCommand = vscode.commands.registerCommand('qsys-deploy.mapScript', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }
        
        const filePath = editor.document.uri.fsPath;
        const settings = getSettings();
        
        if (settings.cores.length === 0) {
            const addCore = await vscode.window.showErrorMessage('No cores configured. Would you like to add one?', 'Add Core');
            if (addCore === 'Add Core') {
                vscode.commands.executeCommand('qsys-deploy.addCore');
            }
            return;
        }
        
        const coreItems = settings.cores.map(core => ({
            label: core.name,
            description: core.ip,
            core
        }));
        
        const selectedCore = await vscode.window.showQuickPick(coreItems, {
            placeHolder: 'Select a Q-SYS Core'
        });
        
        if (!selectedCore) {
            return;
        }
        
        const componentName = await vscode.window.showInputBox({
            prompt: 'Enter component name',
            placeHolder: 'e.g., MainController'
        });
        
        if (!componentName) {
            return;
        }
        
        // Add mapping to configuration
        const config = vscode.workspace.getConfiguration('qsys-deploy');
        const cores = config.get<QSysCore[]>('cores', []);
        
        const coreIndex = cores.findIndex(c => c.name === selectedCore.core.name);
        if (coreIndex !== -1) {
            const normalizedFilePath = vscode.workspace.asRelativePath(filePath);
            
            // Check if mapping already exists
            const existingMappingIndex = cores[coreIndex].scripts.findIndex(
                s => s.filePath === normalizedFilePath
            );
            
            if (existingMappingIndex !== -1) {
                cores[coreIndex].scripts[existingMappingIndex].componentName = componentName;
            } else {
                cores[coreIndex].scripts.push({
                    filePath: normalizedFilePath,
                    componentName
                });
            }
            
            await config.update('cores', cores, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage('Script mapping saved');
        }
    });
    
    // Command: Test connection
    const testConnectionCommand = vscode.commands.registerCommand('qsys-deploy.testConnection', async () => {
        const settings = getSettings();
        
        if (settings.cores.length === 0) {
            const addCore = await vscode.window.showErrorMessage('No cores configured. Would you like to add one?', 'Add Core');
            if (addCore === 'Add Core') {
                vscode.commands.executeCommand('qsys-deploy.addCore');
            }
            return;
        }
        
        const coreItems = settings.cores.map(core => ({
            label: core.name,
            description: core.ip,
            core
        }));
        
        const selectedCore = await vscode.window.showQuickPick(coreItems, {
            placeHolder: 'Select a Q-SYS Core to test'
        });
        
        if (!selectedCore) {
            return;
        }
        
        outputChannel.clear();
        outputChannel.show();
        outputChannel.appendLine(`\n--- Testing connection to ${selectedCore.core.name} (${selectedCore.core.ip}) ---`);
        
        const client = new QrcClient(selectedCore.core.ip, 1710, outputChannel);
        
        try {
            // Connect to the core
            outputChannel.appendLine('Connecting to core...');
            await client.connect();
            
            // Authenticate if credentials are provided
            if (selectedCore.core.username && selectedCore.core.password) {
                outputChannel.appendLine('Authenticating...');
                await client.login(selectedCore.core.username, selectedCore.core.password);
                outputChannel.appendLine('Authentication successful');
            }
            
            // Get components to verify connection
            outputChannel.appendLine('Getting components...');
            const components = await client.getComponents();
            
            outputChannel.appendLine(`Found ${components.length} components:`);
            components.forEach(comp => {
                outputChannel.appendLine(`- ${comp.Name} (Type: ${comp.Type})`);
            });
            
            vscode.window.showInformationMessage(`Successfully connected to ${selectedCore.core.name}. Found ${components.length} components.`);
            updateStatusBar(true, selectedCore.core.name);
            
            // Disconnect
            client.disconnect();
            outputChannel.appendLine('Disconnected from core');
        } catch (err) {
            outputChannel.appendLine(`Connection failed: ${err}`);
            vscode.window.showErrorMessage(`Connection failed: ${err}`);
            updateStatusBar(false);
            client.disconnect();
            outputChannel.appendLine('Disconnected from core');
        }
    });
    
    // Command: Toggle auto-deploy on save
    const toggleAutoDeployCommand = vscode.commands.registerCommand('qsys-deploy.toggleAutoDeployOnSave', async () => {
        const config = vscode.workspace.getConfiguration('qsys-deploy');
        const currentSetting = config.get<boolean>('autoDeployOnSave', false);
        
        await config.update('autoDeployOnSave', !currentSetting, vscode.ConfigurationTarget.Workspace);
        
        vscode.window.showInformationMessage(`Auto-deploy on save: ${!currentSetting ? 'Enabled' : 'Disabled'}`);
    });
    
    // File save event handler for auto-deploy
    const onSaveHandler = vscode.workspace.onDidSaveTextDocument(async (document) => {
        // Only process Lua files
        if (document.languageId !== 'lua') {
            return;
        }
        
        const settings = getSettings();
        const filePath = document.uri.fsPath;
        const scriptMapping = findScriptMapping(filePath);
        
        if (scriptMapping) {
            // Check if auto-deploy is enabled
            const autoDeployForScript = scriptMapping.mapping.autoDeployOnSave !== undefined
                ? scriptMapping.mapping.autoDeployOnSave
                : settings.autoDeployOnSave;
            
            if (autoDeployForScript) {
                await deployScript(filePath, scriptMapping.core, scriptMapping.mapping.componentName);
            }
        }
    });
    
    // Register all commands and event handlers
    context.subscriptions.push(
        deployCurrentScriptCommand,
        addCoreCommand,
        removeCoreCommand,
        mapScriptCommand,
        testConnectionCommand,
        toggleAutoDeployCommand,
        onSaveHandler
    );
}

// Extension deactivation
export function deactivate() {
    console.log('Q-SYS Deploy extension is now deactivated');
}
