#!/usr/bin/env node

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { spawnSync, spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import commandExists from 'command-exists';
import readline from 'readline';
import chalk from 'chalk';

/**
 * @typedef {Object} DockerContainer
 * @property {string} name
 * @property {string} hostPort
 * @property {string} containerPort
 */

/**
 * Function to get the default Docker container name
 * @returns {DockerContainer}
 */
const getSqlServerDockerContainer = () => {
  const obj = {
    name: 'sqlserver-1',
    hostPort: '1433',
    containerPort: '1433',
  };
  try {
    const instances = spawnSync(
      'docker',
      ['ps', '--format', '{{.Names}} {{.Ports}}', '--filter', 'name=sqlserver'],
      { encoding: 'utf8' }
    )
      .stdout.trim()
      .split('\n');
    if (instances.length > 0 && instances[0] !== '') {
      const instance = instances[0]; // Return the first matching container name
      const split = instance.split(' ');
      obj.name = split[0].trim(); // Name of container

      // Extract ports
      const regex = /:(\d+)->(\d+)/;
      const match = split[1].match(regex);
      if (match) {
        obj.hostPort = match[1].trim();
        obj.containerPort = match[2].trim();
      }
    } else {
      warn('No active Docker containers with "sqlserver" in the name were found.');
      err('Please start your docker and make sure you have sqlserver container running');
      process.exit(1);
    }
  } catch (error) {
    warn('Docker command failed. Ensure Docker is installed and running.');
  }
  return obj;
};

// Initialize constants after defining functions
const sqlServerDocker = getSqlServerDockerContainer();
const now = new Date();

// Constants and variables
const nodeVersion = '20';
const currentDir = process.cwd();
const dependencies = ['dotnet'];
const platform = process.platform;
const isWindows = platform === 'win32';

// Variables with defaults. We will prompt the user for these:
let projectPath = './';
let projectName = 'LitiumAccelerator';
let databaseName = `Litium-${new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short' }).format(now)}`;
let sqlServer = 'localhost';
let sqlServerPort = sqlServerDocker.hostPort;
let sqlServerUsername = 'sa';
let sqlServerPassword = 'Pass@word';
let applicationUrl = `${projectName.toLowerCase()}.localtest.me`;
let applicationPort = isWindows ? '5000' : '6000';
let applicationPortHttps = isWindows ? '5001' : '6001';
let litiumUserName = 'admin';
let litiumPassword = 'nimda';
let sqlServerDockerName = sqlServerDocker.name;
let sqlServerDockerContainerPort = sqlServerDocker.containerPort;
let projectType;
let projectDirToRun;

let litiumStorefrontToolPath = path.join(
  process.env.HOME || process.env.USERPROFILE,
  '.dotnet',
  'tools',
  'litium-storefront'
);

if (isWindows) {
  litiumStorefrontToolPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.dotnet',
    'tools',
    'litium-storefront.exe'
  );
}

// Centralized color definitions
const colors = {
  primaryBg: '#8600f4',
  primaryText: '#ffffff',
  secondaryBg: '#c711ff',
  secondaryText: '#000000',
  errorBg: '#e40505',
  errorText: '#ffffff',
  warningBg: '#ffa000',
  warningText: '#000000',
  infoBg: '#64b5f6',
  infoText: '#000000',
  successBg: '#3ff448',
  successText: '#000000',
  highlightText: '#ffeb3b',
  importantBg: '#ffeb3b',
  importantText: '#000000',
};

// Helper functions for colored output
const inf = (message) => {
  console.log(chalk.bgHex(colors.infoBg).hex(colors.infoText)(message));
};

const warn = (message) => {
  console.log(`WARN ${chalk.bgHex(colors.warningBg).hex(colors.warningText)(message)}`);
};

const err = (message) => {
  console.log(`${chalk.bgRed.black('ERROR')} ${chalk.bgHex(colors.errorBg).hex(colors.errorText).underline(message)}`);
};

const pro = (message) => {
  console.log(chalk.bgHex(colors.secondaryBg).hex(colors.secondaryText)(message));
};

const ok = (message) => {
  console.log(chalk.bgHex(colors.successBg).hex(colors.successText)(message));
};

const important = (message) => {
  console.log(chalk.bgHex(colors.importantBg).hex(colors.importantText).bold(message));
};

// Helper functions for formatting prompts
const formatQuestionPrompt = (query, defaultValue) => {
  if (defaultValue) {
    return `${chalk.bgHex(colors.primaryBg).hex(colors.primaryText)(query)} ${chalk.hex(colors.highlightText)(
      '['
    )}${chalk.bgHex(colors.secondaryBg).hex(colors.highlightText)(defaultValue)}${chalk.hex(colors.highlightText)(
      ']'
    )}: `;
  } else {
    return `${chalk.bgHex(colors.primaryBg).hex(colors.primaryText)(query)}: `;
  }
};

const formatSelectionPrompt = (question, options) => {
  const optionList = options.map((option, index) => `  ${index + 1}) ${option}`).join('\n');
  return `${chalk.bgHex(colors.primaryBg).hex(colors.primaryText)(
    `${question}\n${chalk.hex(colors.highlightText)(optionList)}\nPlease enter the number of your choice:`
  )} `;
};

const formatConfirmationPrompt = (text) => {
  return `${chalk.bgHex(colors.importantBg).hex(colors.importantText).bold(text)} `;
};

// Functions
const getSqlCmdPath = (containerName) => {
  try {
    const command = `docker exec ${containerName} ls /opt`;
    const result = execSync(command, { encoding: 'utf8', shell: true }).trim();

    if (!result) {
      throw new Error('No directories found in /opt/');
    }

    const dirs = result.split('\n');

    for (const dir of dirs) {
      if (dir.startsWith('mssql-tools')) {
        const sqlcmdPath = `/opt/${dir}/bin/sqlcmd`;
        try {
          const testCommand = `docker exec ${containerName} test -f ${sqlcmdPath}`;
          execSync(testCommand, { stdio: 'ignore', shell: true });
          return sqlcmdPath;
        } catch (error) {
          // Do nothing, try next path
        }
      }
    }
  } catch (error) {
    // Do nothing
  }

  throw new Error('sqlcmd not found in any known paths');
};

const checkDatabaseExists = (database) => {
  const sqlCmdPath = getSqlCmdPath(sqlServerDockerName);
  const sqlQuery = `SET NOCOUNT ON; SELECT name FROM sys.databases WHERE name = N'${database}';`;
  const command = `docker exec ${sqlServerDockerName} "${sqlCmdPath}" -S ${sqlServer},${sqlServerDockerContainerPort} -U ${sqlServerUsername} -P ${sqlServerPassword} -Q "${sqlQuery}" -h -1 -W`;
  try {
    const result = execSync(command, { encoding: 'utf8', shell: true }).trim();
    return result === database;
  } catch (error) {
    err(`Issues when validating if database "${database}" exists`);
    err(error.message);
    process.exit(1);
  }
};

const clearExistingProjectDirectory = async () => {
  if (fs.existsSync(projectPath)) {
    const absoluteProjectPath = path.resolve(currentDir, projectPath);
    inf(`Folder "${absoluteProjectPath}" already exists.`);
    const shouldDelete = await Prompts.askConfirmation(
      'Do you want to replace it? This will delete all contents in the folder? (Y/n):'
    );
    if (shouldDelete) {
      try {
        fs.rmSync(absoluteProjectPath, { recursive: true, force: true });
        ok(`Cleared existing folder: ${absoluteProjectPath}`);
        return true;
      } catch (error) {
        err(`Failed to delete folder: ${absoluteProjectPath}`);
        err(error.message);
        process.exit(1);
      }
    } else {
      inf('Operation canceled by user.');
      process.exit(0);
    }
  }
  return Promise.resolve();
};

const checkDependencies = (deps) => {
  for (const dep of deps) {
    try {
      commandExists.sync(dep);
      pro(`✅ ${dep} is installed`);
    } catch {
      err(`❌ ${dep} is not installed or not in PATH`);
      err('One or more required dependencies are missing. Aborting.');
      process.exit(1);
    }
  }

  ok('All dependencies are installed! 🎉');
};

const cleanup = () => {
  pro('Cleaning up processes...');
  process.exit(1);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

const runCommand = (command, args = [], cwd = null, options = {}) => {
  pro(`Running command: ${command} ${args.join(' ')} in ${cwd || 'current directory'}`);
  try {
    const result = spawnSync(command, args, {
      stdio: 'inherit',
      cwd,
      shell: isWindows,
      ...options,
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`Command failed with exit code ${result.status}`);
    }
  } catch (error) {
    err(`Failed to run command: ${command} ${args.join(' ')} in ${cwd || 'current directory'}`);
    process.exit(1);
  }
};

const checkNodeVersion = (expectedVersion) => {
  const currentVersion = process.version.replace('v', '');
  if (!currentVersion.startsWith(expectedVersion)) {
    err(`${chalk.bgRed(`Node.js version ${expectedVersion} is required. Current version: ${currentVersion}`)}`);
    process.exit(1);
  }
};

checkNodeVersion(nodeVersion);

const waitForSQLConnection = async () => {
  pro('Waiting for connection to the SQL server (in Docker container)...');
  let sqlConnected = false;
  let sqlAttempts = 0;
  const maxSqlAttempts = 60;

  // Get the sqlcmd path
  let sqlCmdPath;
  try {
    sqlCmdPath = getSqlCmdPath(sqlServerDockerName);
  } catch (error) {
    err(error.message);
    process.exit(1);
  }

  while (!sqlConnected && sqlAttempts < maxSqlAttempts) {
    try {
      const command = `docker exec ${sqlServerDockerName} "${sqlCmdPath}" -S ${sqlServer} -U ${sqlServerUsername} -P ${sqlServerPassword} -Q "SELECT 1" -C`;
      const result = execSync(command, { stdio: 'pipe', shell: true });
      inf('SQL Command Output: ' + result.toString());
      sqlConnected = true;
    } catch (error) {
      sqlAttempts++;
      warn(`Attempt ${sqlAttempts} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
  }

  if (!sqlConnected) {
    err('Could not connect to SQL server. Aborting.');
    process.exit(1);
  }
};

const waitForServerReady = async () => {
  let serverReady = false;
  let serverAttempts = 0;
  const maxServerAttempts = 60;

  pro(`Waiting for server to be ready at https://${applicationUrl}:${applicationPortHttps}/litium`);

  while (!serverReady && serverAttempts < maxServerAttempts) {
    try {
      const response = await fetch(`https://${applicationUrl}:${applicationPortHttps}/litium`);
      inf(`Attempt ${serverAttempts + 1}: Status ${response.status}`);

      // Check for both 200 and 302 status codes
      if (response.status === 302 || response.status === 200) {
        serverReady = true;
        ok('Server is ready!');
      }
    } catch (error) {
      warn(`Attempt ${serverAttempts + 1} failed: ${error.message}`);
    }

    if (!serverReady) {
      serverAttempts++;
      pro(`Waiting 3 seconds before next attempt (${serverAttempts}/${maxServerAttempts})...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  if (!serverReady) {
    err('.NET server did not start in time. Aborting.');
    process.exit(1);
  }
};

// Interactive prompts encapsulated in a Prompts object
const Prompts = {
  // Function to prompt user for input
  askQuestion: (query, defaultValue) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      const formattedQuery = formatQuestionPrompt(query, defaultValue);
      rl.question(formattedQuery, (answer) => {
        rl.close();
        resolve(answer || defaultValue);
      });
    });
  },

  // Function to prompt user for selection
  askSelection: async (question, options, defaultValue = null) => {
    const prompt = formatSelectionPrompt(question, options);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        rl.close();
        const choice = answer.trim();
        const selectedIndex = parseInt(choice, 10) - 1;
        if (selectedIndex >= 0 && selectedIndex < options.length) {
          resolve(options[selectedIndex]);
        } else {
          warn('Invalid choice. Please try again.');
          resolve(Prompts.askSelection(question, options, defaultValue));
        }
      });
    });
  },

  // Function to prompt user for confirmation with highlighted message
  askConfirmation: async (text) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const formattedText = formatConfirmationPrompt(text);

    return new Promise((resolve) => {
      const prompt = () => {
        rl.question(formattedText, (answer) => {
          const trimmedAnswer = answer.trim().toLowerCase();
          if (trimmedAnswer === 'y') {
            rl.close();
            resolve(true);
          } else if (trimmedAnswer === 'n') {
            rl.close();
            resolve(false);
          } else {
            warn('Please enter "y" or "n"');
            // Repeat the prompt without closing rl
            prompt();
          }
        });
      };
      prompt();
    });
  },
};

// Function to display summary and confirm installation
const displaySummaryAndConfirm = async () => {
  const summaryText = `
Summary of configuration:
 - Project Path: ${path.resolve(currentDir, projectPath)}
 - Project Name: ${projectName}
 - Database Name: ${databaseName}
 - SQL Server: ${sqlServer}
 - SQL Server Username: ${sqlServerUsername}
 - SQL Server Password: ${sqlServerPassword}
 - Application URL: ${applicationUrl}:${applicationPortHttps}
 - Litium Username: ${litiumUserName}
 - Litium Password: ${litiumPassword}
 - SQL Server Docker Container Name: ${sqlServerDockerName}
 - Project Type: ${projectType}

Do you want to proceed with the installation? (Y/n):`;

  return await Prompts.askConfirmation(summaryText);
};

// Function to prompt for variable values
const promptVariables = async () => {
  projectPath = await Prompts.askQuestion('Enter project path', projectPath);
  projectName = await Prompts.askQuestion('Enter project name', projectName);
  projectPath = path.join(projectPath, projectName);
  sqlServerDockerName = await Prompts.askQuestion(`Enter SQL Server Docker container name`, sqlServerDockerName);
  sqlServerDockerContainerPort = await Prompts.askQuestion(
    'Enter port for Docker SQL instance',
    sqlServerDockerContainerPort
  );
  databaseName = await Prompts.askQuestion('Enter database name', databaseName);

  let tempDb = databaseName;
  let dbExists = await checkDatabaseExists(tempDb);

  while (dbExists) {
    if (dbExists) {
      const overwrite = await Prompts.askConfirmation(
        `Database ${tempDb} already exists. Do you want to overwrite it? (Y/n):`
      );
      if (overwrite) {
        databaseName = tempDb;
        dbExists = false;
      } else {
        tempDb = await Prompts.askQuestion('Enter another name for the database', tempDb);
        dbExists = await checkDatabaseExists(tempDb);
        databaseName = tempDb;
      }
    }
  }

  sqlServer = await Prompts.askQuestion('Enter SQL Server address', sqlServer);
  sqlServerPort = await Prompts.askQuestion('Enter SQL Server port', sqlServerPort);
  sqlServerUsername = await Prompts.askQuestion('Enter SQL Server username', sqlServerUsername);
  sqlServerPassword = await Prompts.askQuestion('Enter SQL Server password', sqlServerPassword);
  applicationUrl = await Prompts.askQuestion('Enter application URL', `${projectName.toLowerCase()}.localtest.me`);
  applicationPort = await Prompts.askQuestion('Enter application port (Http)', applicationPort);
  applicationPortHttps = await Prompts.askQuestion('Enter secure application port (Https)', applicationPortHttps);
  litiumUserName = await Prompts.askQuestion('Enter Litium username', litiumUserName);
  litiumPassword = await Prompts.askQuestion('Enter Litium password', litiumPassword);

  // Ask for project type selection
  const options = ['MVC', 'Headless'];
  projectType = await Prompts.askSelection('Select project type to set up:', options);
  projectType = projectType.toLowerCase();
};

// Function to check if tool manifest exists
const toolManifestExists = (directory) => {
  const manifestPath = path.join(directory, '.config', 'dotnet-tools.json');
  return fs.existsSync(manifestPath);
};

// Function to check if a .NET tool is installed
const isDotnetToolInstalled = (commandName, directory) => {
  try {
    const result = spawnSync('dotnet', ['tool', 'list'], {
      cwd: directory,
      encoding: 'utf8',
      shell: isWindows,
    });
    if (result.error) {
      throw result.error;
    }
    const output = result.stdout;

    // Split output into lines
    const lines = output.trim().split('\n');

    // Check if there are enough lines (headers + at least one tool)
    if (lines.length < 3) {
      return false; // No tools installed
    }

    // Skip header lines
    const toolLines = lines.slice(2);

    // Iterate over each tool line
    for (const line of toolLines) {
      // Split line into columns based on whitespace
      const columns = line.trim().split(/\s+/);
      if (columns.length >= 3) {
        const installedCommandName = columns[2];
        if (installedCommandName === commandName) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    err(`Failed to list dotnet tools: ${error.message}`);
    process.exit(1);
  }
};

// Function to set up the project (common for both MVC and Headless)
const setupProject = (backendDir) => {
  // Install the appropriate Litium template
  if (projectType === 'mvc') {
    inf('Installing MVC Accelerator Litium template...');
    runCommand('dotnet', ['new', '--install', 'Litium.Accelerator.Templates'], backendDir);
  } else if (projectType === 'headless') {
    inf('Installing Empty Litium project template...');
    runCommand('dotnet', ['new', '--install', 'Litium.Empty.Templates'], backendDir);
  }

  // Create the project with --storefront-api
  if (projectType === 'mvc') {
    inf('Creating Litium MVC Accelerator project with Storefront API...');
    runCommand('dotnet', ['new', 'litmvcacc', '--storefront-api'], backendDir);
  } else if (projectType === 'headless') {
    inf('Creating Empty Litium project with Storefront API...');
    runCommand('dotnet', ['new', 'litemptyweb', '--storefront-api'], backendDir);
  }

  // Now, install tool-manifest and Litium.Application.Migrations
  inf('Installing tool-manifest');
  if (!toolManifestExists(backendDir)) {
    runCommand('dotnet', ['new', 'tool-manifest'], backendDir);
    ok('Tool manifest created.');
  } else {
    inf('Tool manifest already exists. Skipping creation.');
  }

  // Install Litium.Application.Migrations tool if not installed
  const toolCommandName = 'litium-db';
  inf(`Checking if ${toolCommandName} is installed...`);
  if (!isDotnetToolInstalled(toolCommandName, backendDir)) {
    inf(`${toolCommandName} is not installed. Installing...`);
    runCommand('dotnet', ['tool', 'install', 'Litium.Application.Migrations'], backendDir);
    ok(`${toolCommandName} installed successfully.`);
  } else {
    inf(`${toolCommandName} is already installed. Skipping installation.`);
  }

  // Create Properties directory and configuration files for the .NET project in the backend directory
  fs.mkdirSync(path.join(projectDirToRun, 'Properties'), { recursive: true });

  const launchSettings = {
    profiles: {
      [projectType === 'mvc' ? 'Litium.Accelerator.Mvc' : 'Litium.Empty']: {
        commandName: 'Project',
        launchBrowser: true,
        environmentVariables: {
          ASPNETCORE_ENVIRONMENT: 'Development',
        },
        applicationUrl: `https://${applicationUrl}:${applicationPortHttps}`,
      },
    },
  };

  fs.writeFileSync(
    path.join(projectDirToRun, 'Properties', 'launchSettings.json'),
    JSON.stringify(launchSettings, null, 2)
  );

  // Common appsettings for both MVC and Headless
  const appSettingsContent = `{
    "Litium": {
      "Data": {
        "ConnectionString": "Pooling=true;User Id=${sqlServerUsername};Password=${sqlServerPassword};Database=${databaseName};Server=${sqlServer},${sqlServerPort};TrustServerCertificate=True",
        "EnableSensitiveDataLogging": false
      },
      "Folder": {
        "Local": "../files",
        "Shared": null
      },
      "Elasticsearch": {
        "ConnectionString": "http://127.0.0.1:9200",
        "Username": null,
        "Password": null,
        "Prefix": "${projectType === 'mvc' ? 'AcceleratorV1' : 'StorefrontV1'}",
        "Synonym": {
          "Server": null,
          "ApiKey": null
        }
      },
      "Redis": {
        "Prefix": "${projectType === 'mvc' ? 'AcceleratorV2' : 'StorefrontV2'}",
        "Cache": {
          "ConnectionString": null,
          "Password": null
        },
        "DistributedLock": {
          "ConnectionString": null,
          "Password": null
        },
        "ServiceBus": {
          "ConnectionString": null,
          "Password": null
        }
      }
      ${projectType === 'headless' ? `,
      "Websites": {
        "Storefronts": {
          "headless-accelerator": {
            "host": "https://localhost:3001"
          }
        }
      }
      ` : ''}
    }
  }
  `;

  fs.writeFileSync(
    path.join(projectDirToRun, 'appsettings.Development.json'),
    appSettingsContent
  );
};

// Function to set up Headless project
const setupHeadlessProject = (headlessDir) => {
  // Create Headless project
  inf('Installing React Accelerator Litium template...');
  runCommand('dotnet', ['new', '--install', 'Litium.Accelerator.React.Templates'], headlessDir);

  inf('Creating Litium React Accelerator project...');
  runCommand('dotnet', ['new', 'litreactacc'], headlessDir);

  // Create .env.local for the headless project
  fs.writeFileSync(
    path.join(headlessDir, '.env.local'),
    `# The domain name for your Litium platform installation.
RUNTIME_LITIUM_SERVER_URL=https://${applicationUrl}:${applicationPortHttps}
# If you are using a self-signed certificate for the Litium platform
# you may also need to add the following line to turn off certificate validation.
NODE_TLS_REJECT_UNAUTHORIZED="0"
`
  );

  // Install dependencies with yarn for the headless project
  inf('Installing dependencies for the Litium React Accelerator...');
  runCommand('yarn', [], headlessDir);
};

// Main execution using top-level await
await promptVariables();

// Display summary of configurations and ask for confirmation
const confirmResponse = await displaySummaryAndConfirm();
if (!confirmResponse) {
  inf('Installation cancelled by user.');
  process.exit(0);
}

// Check and clear existing project directory
await clearExistingProjectDirectory();

// Resolve the project directory
const projectDir = path.resolve(currentDir, projectPath);

// Define backendDir and headlessDir after projectDir is resolved
const backendDir = path.join(projectDir, 'Litium'); // Should be inside projectDir
const headlessDir = path.join(projectDir, 'Litium.Storefront'); // Should be inside projectDir

if (projectType === 'mvc') {
  // For MVC, the project is located at backendDir/Src/Litium.Accelerator.Mvc
  projectDirToRun = path.join(backendDir, 'Src', 'Litium.Accelerator.Mvc');
} else if (projectType === 'headless') {
  // For Headless, adjust accordingly if needed
  projectDirToRun = backendDir; // Assuming the project is directly under backendDir
}

// Create project directory if it doesn't exist
if (!fs.existsSync(projectDir)) {
  fs.mkdirSync(projectDir, { recursive: true });
  ok(`Created project directory: ${projectDir}`);
}

checkDependencies(dependencies);


pro('Setting up the Litium environment...');

// Create necessary directories
fs.mkdirSync(backendDir, { recursive: true });

if (projectType === 'headless') {
  fs.mkdirSync(headlessDir, { recursive: true });
}

// Set up the project
setupProject(backendDir);

if (projectType === 'headless') {
  setupHeadlessProject(headlessDir);
}

// Wait for connection to SQL server (via Docker)
await waitForSQLConnection();

// Get the sqlcmd path
let sqlCmdPath;
try {
  sqlCmdPath = getSqlCmdPath(sqlServerDockerName);
} catch (error) {
  err(error.message);
  process.exit(1);
}

inf(`Creating database ${databaseName}...`);
try {
  if (checkDatabaseExists(databaseName)) {
    // Drop the existing database
    inf('Dropping the existing database');
    const dropQuery = `USE master; ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${databaseName}];`;
    const dropCommand = `docker exec ${sqlServerDockerName} "${sqlCmdPath}" -S ${sqlServer},${sqlServerDockerContainerPort} -U ${sqlServerUsername} -P ${sqlServerPassword} -Q "${dropQuery}" -C`;
    execSync(dropCommand, { stdio: 'inherit', shell: true });
    inf(`Database ${databaseName} has been dropped.`);
  }

  inf(`Creating database ${databaseName}`);

  // Create the new database
  const createQuery = `CREATE DATABASE [${databaseName}];`;
  const createCommand = `docker exec ${sqlServerDockerName} "${sqlCmdPath}" -S ${sqlServer},${sqlServerDockerContainerPort} -U ${sqlServerUsername} -P ${sqlServerPassword} -Q "${createQuery}" -C`;
  execSync(createCommand, { stdio: 'inherit', shell: true });

  inf(`Database ${databaseName} has been created.`);
} catch (error) {
  err('Error creating database: ' + error.message);
}

inf('Updating database...');
runCommand(
  'dotnet',
  [
    'litium-db',
    'update',
    '--connection',
    `${isWindows ? '"' : ''}Pooling=true;User Id=${sqlServerUsername};Password=${sqlServerPassword};Database=${databaseName};Server=${sqlServer},${sqlServerPort};TrustServerCertificate=True${isWindows ? '"' : ''}`,
  ],
  backendDir
);

inf('Adding user...');
runCommand(
  'dotnet',
  [
    'litium-db',
    'user',
    '--connection',
    `${isWindows ? '"' : ''}Pooling=true;User Id=${sqlServerUsername};Password=${sqlServerPassword};Database=${databaseName};Server=${sqlServer},${sqlServerPort};TrustServerCertificate=True${isWindows ? '"' : ''}`,
    '--login',
    litiumUserName,
    '--password',
    litiumPassword,
  ],
  backendDir
);

// Start .NET server
inf('Starting .NET server...');

const dotnetProcess = spawn('dotnet', ['run'], {
  cwd: projectDirToRun,
  stdio: 'inherit',
  shell: isWindows,
});

await waitForServerReady();

if (projectType === 'headless') {
  // Import headless definitions
  inf('Importing headless definitions...');
  runCommand(
    litiumStorefrontToolPath,
    [
      'definition',
      'import',
      '--file',
      `${headlessDir}/litium-definitions/**/*.yaml`,
      '--litium',
      `https://${applicationUrl}:${applicationPortHttps}`,
      '--litium-username',
      litiumUserName,
      '--litium-password',
      litiumPassword,
      '--insecure',
    ],
    headlessDir
  );

  // Export headless translations
  inf('Exporting headless translations...');
  runCommand(
    litiumStorefrontToolPath,
    [
      'text',
      'convert-to-excel',
      '-i',
      './litium-definitions/texts/*.yaml',
      '-f',
      './litium-definitions/texts/xls/texts.xlsx',
    ],
    headlessDir
  );
}

ok(
  `Litium environment setup completed successfully. Access back office at https://${applicationUrl}:${applicationPortHttps}/litium`
);
