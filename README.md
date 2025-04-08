# Q-SYS Lua Script Deployment Extension for VS Code

This extension allows you to edit Lua scripts designed to run on a Q-SYS Core and automatically deploy them when saved to either a running Q-SYS Core or a running instance of Q-SYS Designer in emulation mode.

## Features

- Edit Lua scripts for Q-SYS Core
- Deploy scripts to Q-SYS Core or Designer with a keyboard shortcut (Ctrl+Alt+D)
- Optionally auto-deploy scripts on save
- Configure multiple cores with different IP addresses
- Map scripts to multiple components across multiple cores
- Support for authentication
- Validate component types before deployment

## Changelog

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

* `qsys-deploy.autoDeployOnSave`: Enable/disable automatic deployment on save (global setting)
* `qsys-deploy.cores`: Array of Q-SYS Core configurations
* `qsys-deploy.defaultCore`: Default core for new scripts

Example configuration:

```json
{
  "qsys-deploy": {
    "autoDeployOnSave": false,
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
        ],
        "autoDeployOnSave": true
      }
    ],
    "defaultCore": "Main Auditorium"
  }
}
```

## Commands

This extension provides the following commands:

* `Q-SYS: Deploy Current Script`: Deploy the current script to all mapped components across all cores
* `Q-SYS: Test Core Connection`: Test connection to a Q-SYS Core
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
2. Configure your cores and script mappings in the settings.json file (see Example configuration above)
3. Edit your script and press Ctrl+Alt+D to deploy it to all mapped components across all cores
4. Optionally enable auto-deploy on save by setting `autoDeployOnSave` to true in your settings

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
