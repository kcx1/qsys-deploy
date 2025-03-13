# Q-SYS Lua Script Deployment Extension for VS Code

This extension allows you to edit Lua scripts designed to run on a Q-SYS Core and automatically deploy them when saved to either a running Q-SYS Core or a running instance of Q-SYS Designer in emulation mode.

## Features

- Edit Lua scripts for Q-SYS Core
- Deploy scripts to Q-SYS Core or Designer with a keyboard shortcut (Ctrl+Alt+D)
- Optionally auto-deploy scripts on save
- Configure multiple cores with different IP addresses
- Map scripts to specific components
- Support for authentication
- Validate component types before deployment

## Requirements

- Visual Studio Code 1.60.0 or higher
- A running Q-SYS Core or Q-SYS Designer in emulation mode

## Extension Settings

This extension contributes the following settings:

* `qsys-deploy.autoDeployOnSave`: Enable/disable automatic deployment on save (global setting)
* `qsys-deploy.cores`: Array of Q-SYS Core configurations
* `qsys-deploy.defaultCore`: Default core for new scripts

Example configuration:

```json
"qsys-deploy": {
  "autoDeployOnSave": false,
  "cores": [
    {
      "name": "Main Auditorium",
      "ip": "192.168.1.100",
      "username": "admin",
      "password": "pass",
      "scripts": [
        {
          "filePath": "scripts/main-control.lua",
          "componentName": "MainController",
          "autoDeployOnSave": true
        }
      ]
    }
  ],
  "defaultCore": "Main Auditorium"
}
```

## Commands

This extension provides the following commands:

* `Q-SYS: Deploy Current Script`: Deploy the current script to its mapped component
* `Q-SYS: Add Core Configuration`: Add a new Q-SYS Core configuration
* `Q-SYS: Remove Core Configuration`: Remove a Q-SYS Core configuration
* `Q-SYS: Map Script to Component`: Map the current script to a component
* `Q-SYS: Test Core Connection`: Test connection to a Q-SYS Core
* `Q-SYS: Toggle Auto-Deploy on Save`: Toggle the global auto-deploy setting
* `Q-SYS: Show Debug Output`: Show the debug output panel with detailed logs

## Debugging

If you encounter issues with deployment, you can use the debug output panel to troubleshoot:

1. Run the `Q-SYS: Show Debug Output` command to open the debug output panel
2. Try deploying a script or testing a connection
3. The debug output will show detailed logs of the QRC communication, including:
   - Connection attempts
   - Authentication
   - Component validation
   - Commands sent to the core
   - Responses received from the core

This information can help identify where the deployment process is failing.

## Usage

1. Open a Lua script file in VS Code
2. Use the command palette (Ctrl+Shift+P) to run `Q-SYS: Add Core Configuration` to add a Q-SYS Core
3. Use the command palette to run `Q-SYS: Map Script to Component` to map the script to a component
4. Edit your script and press Ctrl+Alt+D to deploy it to the Q-SYS Core
5. Optionally enable auto-deploy on save using the `Q-SYS: Toggle Auto-Deploy on Save` command

## Component Type Validation

The extension validates that the target component is one of the following types:
- device_controller_script
- control_script_2
- scriptable_controls

## QRC Protocol

This extension uses the QRC protocol to communicate with Q-SYS Core. For more information about the QRC protocol, see:
- [QRC Overview](https://q-syshelp.qsc.com/content/External_Control_APIs/QRC/QRC_Overview.htm)
- [QRC Commands](https://q-syshelp.qsc.com/content/External_Control_APIs/QRC/QRC_Commands.htm)

## License

This extension is licensed under the MIT License.
