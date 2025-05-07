# Q-SYS Lua Script Deployment Extension for VS Code

This extension allows you to edit Lua scripts designed to run on a Q-SYS Core and automatically deploy them to either a running Q-SYS Core or a running instance of Q-SYS Designer in emulation mode.

## Features

- Edit Lua scripts for Q-SYS Core
- Deploy scripts to Q-SYS Core or Designer with a keyboard shortcut (Ctrl+Alt+D)
- Configure multiple cores with different IP addresses
- Map scripts to multiple components across multiple cores
- Support for authentication
- Validate component types before deployment

## Changelog

### 0.3.0

- Enhanced "Deploy Current Script" command with interactive core and component selection:
  - When deploying to existing mapped scripts, you can now choose specific cores and components
  - "Select All" option provided at both core and component selection stages
- Reduced debug output verbosity for better readability
- Removed unused defaultCore setting

### 0.2.0

- Added support for deploying a single script to multiple Q-SYS Cores
- Added support for deploying a script to multiple components within a core
- Removed UI commands for configuration management (now done via settings.json)
- Configuration format updated to support multiple deployment targets

## Requirements

- Visual Studio Code 1.60.0 or higher
- A running Q-SYS Core or Q-SYS Designer in emulation mode

## Extension Settings

This extension contributes the following settings:

- `qsys-deploy.cores`: Array of Q-SYS Core configurations
- `qsys-deploy.scripts`: Array of script deployment configurations

Example configuration:

```json
{
  "qsys-deploy": {
    "cores": [
      {
        "name": "Main Auditorium",
        "ip": "192.168.1.100",
        "username": "admin",
        "password": "pass"
      },
      {
        "name": "Backup Core",
        "ip": "192.168.1.101",
        "username": "admin",
        "password": "pass"
      }
    ],
    "scripts": [
      {
        "filePath": "scripts/main-control.lua",
        "targets": [
          {
            "coreName": "Main Auditorium",
            "components": ["MainController", "SecondaryController"]
          },
          {
            "coreName": "Backup Core",
            "components": ["MainController"]
          }
        ]
      }
    ]
  }
}
```

## Commands

This extension provides the following commands:

- `Q-SYS: Deploy Current Script`: Deploy the current script with interactive core and component selection
- `Q-SYS: Test Core Connection`: Test connection to a Q-SYS Core
- `Q-SYS: Show Debug Output`: Show the debug output panel with detailed logs

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
2. Configure your cores and script mappings in the settings.json file (see Example configuration above)
3. Edit your script and press Ctrl+Alt+D to deploy it:
   - For mapped scripts: You'll be prompted to select which cores and components to deploy to
   - For unmapped scripts: You'll be prompted to select a core and enter a component name

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
