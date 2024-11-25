#!/usr/bin/env node

process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';

const { spawnSync, spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const commandExists = require('command-exists');
const readline = require('readline');
const ttyEscape = (code) => `\u001B[${code}m`;
const ttyMkBold = (color) => `${ttyEscape('1')}${ttyEscape(color)}`;
const ttyBlue = (text) => `${ttyMkBold(34)}${text}${ttyEscape(0)}`;
const ttyRed = (text) => `${ttyMkBold(31)}${text}${ttyEscape(0)}`;
const ttyGreen = (text) => `${ttyMkBold(32)}${text}${ttyEscape(0)}`;
const ttyYellow = (text) => `${ttyMkBold(33)}${text}${ttyEscape(0)}`;
const ttyGrey = (text) => `${ttyMkBold(30)}${text}${ttyEscape(0)}`;
const ttyBold = (text) => `${ttyMkBold(39)}${text}${ttyEscape(0)}`;

// Constants
const nodeVersion = '20';
const currentDir = process.cwd();
const dependencies = ['dotnet'];
const platform = process.platform;
const isWindows = platform === 'win32';
const sqlServerDocker = getSqlServerDockerContainer();
const now = new Date();

// Variables with defaults. We will prompt the user for these:
let projectPath = './LitiumAccelerator';
let projectName = 'LitiumAccelerator';
let databaseName = `Litium-${new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short'}).format(now)}`;
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

let litiumStorefrontToolPath = path.join(process.env.HOME || process.env.USERPROFILE, '.dotnet', 'tools', 'litium-storefront');

if (isWindows) {
  litiumStorefrontToolPath = path.join(process.env.HOME || process.env.USERPROFILE, '.dotnet', 'tools', 'litium-storefront.exe');
}

// Functions


function pro(message) {
  console.log(`${ttyBlue('==>')} ${ttyBold(message)}`);
}

function inf(message) {
  console.log(`${ttyGrey('===>')} ${ttyBold(message)}`);
}

function ok(message) {
  console.log(`${ttyGreen('OK')} ${message}`);
}

function warn(message) {
  console.log(`${ttyYellow('WARN')} ${message}`);
}

function err(message) {
  console.error(`${ttyRed('ERROR')} ${message}`);
}

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
function getSqlServerDockerContainer() {
  var obj = {
    name: 'sqlserver-1',
    hostPort: '1433',
    containerPort: '1433',
  };
  try {
    const instances = spawnSync('docker', ['ps', '--format', '{{.Names}} {{.Ports}}', '--filter', 'name=sqlserver'], { encoding: 'utf8' })
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
}

// Function to check for the sqlcmd path in the Docker container
function getSqlCmdPath(containerName) {
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
}

function checkDatabaseExists(database) {
  const sqlCmdPath = getSqlCmdPath(sqlServerDockerName);
  const sqlQuery = `SET NOCOUNT ON; SELECT name FROM sys.databases WHERE name = N'${database}';`;
  const command = `docker exec ${sqlServerDockerName} "${sqlCmdPath}" -S ${sqlServer},${sqlServerDockerContainerPort} -U ${sqlServerUsername} -P ${sqlServerPassword} -Q "${sqlQuery}" -h -1 -W`;
  try {
    const result = execSync(command, { encoding: 'utf8', shell: true }).trim();
    return result === database;
  } catch (error) {
    return false;
  }
}

// Function to clear the existing project directory
async function clearExistingProjectDirectory() {
  if (fs.existsSync(projectPath)) {
    const absoluteProjectPath = path.resolve(currentDir, projectPath);
    inf(`Folder "${absoluteProjectPath}" already exists.`);
    const shouldDelete = await askConfirmation('Do you want to replace it? This will delete all contents in the folder?');
    if(shouldDelete) {
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
}

function checkDependencies(deps) {
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

  console.log('All dependencies are installed! 🎉');
}

function cleanup() {
  pro('Cleaning up processes...');
  process.exit(1);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function runCommand(command, args = [], cwd = null, options = {}) {
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
}

function checkNodeVersion(expectedVersion) {
  const currentVersion = process.version.replace('v', '');
  if (!currentVersion.startsWith(expectedVersion)) {
    err(`Node.js version ${expectedVersion} is required. Current version: ${currentVersion}`);
    process.exit(1);
  }
}

async function waitForSQLConnection() {
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
      console.log('SQL Command Output:', result.toString());
      sqlConnected = true;
    } catch (error) {
      sqlAttempts++;
      console.error(`Attempt ${sqlAttempts} failed:`, error.message);
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
  }

  if (!sqlConnected) {
    err('Could not connect to SQL server. Aborting.');
    process.exit(1);
  }
}

async function waitForServerReady() {
  let serverReady = false;
  let serverAttempts = 0;
  const maxServerAttempts = 60;

  console.log(`Waiting for server to be ready at https://${applicationUrl}:${applicationPortHttps}/litium`);

  while (!serverReady && serverAttempts < maxServerAttempts) {
    try {
      const response = await fetch(`https://${applicationUrl}:${applicationPortHttps}/litium`);
      console.log(`Attempt ${serverAttempts + 1}: Status ${response.status}`);

      // Check for both 200 and 302 status codes
      if (response.status === 302 || response.status === 200) {
        serverReady = true;
        console.log('Server is ready!');
      }
    } catch (error) {
      console.log(`Attempt ${serverAttempts + 1} failed:`, error.message);
    }

    if (!serverReady) {
      serverAttempts++;
      pro(`Waiting 3 seconds before next attempt (${serverAttempts}/${maxServerAttempts})...`)
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  if (!serverReady) {
    console.error('.NET server did not start in time. Aborting.');
    process.exit(1);
  }
}

// Function to prompt user for input
function askQuestion(query, defaultValue) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const formattedQuery = defaultValue ? `${query} (${defaultValue}): ` : `${query}: `;
    rl.question(formattedQuery, (answer) => {
      rl.close();
      resolve(answer || defaultValue);
    });
  });
}

// Function to prompt user for selection
async function askSelection(question, options, defaultValue = null) {
  const optionList = options.map((option, index) => `  ${index + 1}) ${option}`).join('\n');
  const prompt = `${question}\n${optionList}\nPlease enter the number of your choice: `;

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
        console.log('Invalid choice. Please try again.');
        resolve(askSelection(question, options, defaultValue));
      }
    });
  });
}

const askConfirmation = async (text) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const prompt = () => {
      rl.question(text, (answer) => {
        const trimmedAnswer = answer.trim().toLowerCase();
        console.log(trimmedAnswer);
        if (trimmedAnswer === 'y') {
          rl.close();
          resolve(true);
        } else if (trimmedAnswer === 'n') {
          rl.close();
          resolve(false);
        } else {
          console.log('Please enter "y" or "n"');
          // Repeat the prompt without closing rl
          prompt();
        }
      });
    };
    prompt();
  });
};

// Function to display summary and confirm installation
async function displaySummaryAndConfirm() {
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

  Do you want to proceed with the installation? (Y/n): `;

  return await askConfirmation(summaryText);
}

// Function to prompt for variable values
async function promptVariables() {
  projectPath = await askQuestion('Enter project path', projectPath);
  projectName = await askQuestion('Enter project name', projectName);
  sqlServerDockerName = await askQuestion(`Enter SQL Server Docker container name`, sqlServerDockerName);
  sqlServerDockerContainerPort = await askQuestion('Enter port for Docker SQL instance', sqlServerDockerContainerPort);
  databaseName = await askQuestion('Enter database name', databaseName);
 
  let tempDb = databaseName;
  let dbExists = await checkDatabaseExists(tempDb);

  while (dbExists) {
    if (dbExists) {
      const overwrite = await askConfirmation(`Database ${tempDb} already exists. Do you want to overwrite it? (Y/n): `);
      if (overwrite) {
        databaseName = tempDb;
        dbExists = false;
      } else {
        tempDb = await askQuestion('Enter another name for the database', tempDb);
        dbExists = await checkDatabaseExists(tempDb);
        databaseName = tempDb;
      }
    }
  }

  sqlServer = await askQuestion('Enter SQL Server address', sqlServer);
  sqlServerPort = await askQuestion('Enter SQL Server port', sqlServerPort);
  sqlServerUsername = await askQuestion('Enter SQL Server username', sqlServerUsername);
  sqlServerPassword = await askQuestion('Enter SQL Server password', sqlServerPassword);
  applicationUrl = await askQuestion('Enter application URL', `${projectName.toLowerCase()}.localtest.me`);
  applicationPort = await askQuestion('Enter application port (Http)', applicationPort);
  applicationPortHttps = await askQuestion('Enter secure application port (Https)', applicationPortHttps);
  litiumUserName = await askQuestion('Enter Litium username', litiumUserName);
  litiumPassword = await askQuestion('Enter Litium password', litiumPassword);

  // Ask for project type selection
  const options = ['MVC', 'Headless'];
  projectType = await askSelection('Select project type to set up:', options);
  projectType = projectType.toLowerCase();
}

// Function to check if tool manifest exists
function toolManifestExists(directory) {
  const manifestPath = path.join(directory, '.config', 'dotnet-tools.json');
  return fs.existsSync(manifestPath);
}

// Function to check if a .NET tool is installed
function isDotnetToolInstalled(commandName, directory) {
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
}

// Function to set up the project (common for both MVC and Headless)
function setupProject(backendDir) {
 
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
    },
    ${projectType === 'headless' ? `
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
}

// Function to set up Headless project
function setupHeadlessProject(headlessDir) {
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
}

// Main execution
(async () => {

  // Prompt the user for variable values
  await promptVariables();

  // Display summary of configurations and ask for confirmation
  const confirmResponse = await displaySummaryAndConfirm();
  if (!confirmResponse) {
    console.log('Installation cancelled by user.');
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
  checkNodeVersion(nodeVersion);

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
      inf('Drop the existing database');
      const dropQuery = `USE master; ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${databaseName}];`;
      const dropCommand = `docker exec ${sqlServerDockerName} "${sqlCmdPath}" -S ${sqlServer},${sqlServerDockerContainerPort} -U ${sqlServerUsername} -P ${sqlServerPassword} -Q "${dropQuery}" -C`;
      execSync(dropCommand, { stdio: 'inherit', shell: true });
      inf(`Database ${databaseName} has been dropped.`);
    }

    inf(`Creating database ${databaseName}}`);

    // Create the new database
    const createQuery = `CREATE DATABASE [${databaseName}];`;
    const createCommand = `docker exec ${sqlServerDockerName} "${sqlCmdPath}" -S ${sqlServer},${sqlServerDockerContainerPort} -U ${sqlServerUsername} -P ${sqlServerPassword} -Q "${createQuery}" -C`;
    execSync(createCommand, { stdio: 'inherit', shell: true });

    inf(`Database ${databaseName} has been created.`);
  } catch (error) {
    console.error('Error creating database:', error.message);
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

  const dotnetProcess = spawn('dotnet', ['run'], { cwd: projectDirToRun, stdio: 'inherit', shell: isWindows });

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

  ok(`Litium environment setup completed successfully. Access back office at https://${applicationUrl}:${applicationPortHttps}/litium`);
})();
