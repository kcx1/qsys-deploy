import * as net from 'net';

// Interface definitions
interface QSysCore {
    name: string;
    ip: string;
    username?: string;
    password?: string;
}

interface DeploymentTarget {
    coreName: string;
    components: string[];
}

interface ScriptMapping {
    filePath: string;
    targets: DeploymentTarget[];
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
    public sendCommand(method: string, params: any[] | object = []): Promise<any> {
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
            await this.sendCommand('Logon', {
                User: username,
                Password: password
            });
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



