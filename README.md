<h1 align="center">
	<br>
	<br>
	<img width="320" src="media/hayo.svg" alt="HAYO">
	<br>
	<br>
	<br>
</h1>

# Create Litium Accelerator

[![npm version](https://img.shields.io/npm/v/create-litium-accelerator.svg)](https://www.npmjs.com/package/create-litium-accelerator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Introduction

`create-litium-accelerator` is a [Node.js](https://nodejs.org/en) package that streamlines the setup of a Litium development environment. It provides an easy and recommended way to create a new Litium project with minimal configuration, reducing setup time and potential errors.

Litium offers accelerators to help you create unique customer experiences quickly while reducing time to market and lowering project risks. Using `create-litium-accelerator` simplifies the installation process and ensures all components are correctly configured.

## Features

- **Interactive Setup**: Guides you through project configuration with interactive prompts.
- **Supports Both MVC and Headless Projects**: Choose between MVC Accelerator and React Accelerator (Headless) during setup.
- **Automated Dependency Installation**: Installs necessary dependencies and tools automatically.
- **Database Setup**: Configures the database and runs migrations.
- **Easy Start**: Initializes the Litium BO

## Prerequisites

Before using `create-litium-accelerator`, ensure that you have the following installed on your system:

### Software Requirements

- **Node.js** version **20.x**
  - Verify by running `node -v`.
- **.NET SDK** compatible with Litium
  - Verify by running `dotnet --version`.
- **Docker** with Docker Compose
  - Verify Docker is running and accessible.
- **Docker Desktop** (if on Windows or Mac)

### Command Line Tools

Ensure the following commands are available in your system's PATH:

- `dotnet`
- `docker`

### Docker Containers

- A running SQL Server Docker container named `sqlserver-1` (default)
  - The setup will check for a Docker container with `sqlserver` in its name.
  - Ensure the container is running and accessible.

### Network Requirements

- **Elasticsearch**, **Redis**, and **Kibana** services should be running.
  - Use the provided `docker-compose.yaml` file to set up these shared dependencies.
  - Ensure Docker's default network is set to `192.168.65.0`.

### Permissions

- Ensure you have the necessary permissions to create and delete directories and databases on your system.

## Installation

### Step 1: Before You Start

Before installing the Litium Accelerator, you need to:

- **Set Up the Litium NuGet Feed**

  Litium platform packages are distributed through the Litium NuGet repository, which requires authentication using your Litium Docs credentials. Please refer to the [Litium NuGet Feed Setup Instructions](https://docs.litium.com/documentation/system-requirements/litium-packages) for detailed steps.

- **Set Up Shared Dependencies**

  Set up Elasticsearch, Redis, and Kibana as per the [Shared Dependencies Setup Instructions](https://docs.litium.com/documentation/system-requirements/shared-dependencies).

### Step 2: Use `npx` to Create the Litium Accelerator

Run the following command in your terminal:

```bash
npx @hayodev/create-litium-accelerator
```

This command will fetch the latest version of `create-litium-accelerator` from NPM and execute it.

### Or using [Deno](https://docs.deno.com/runtime/getting_started/installation/) 

Run the following cmd in your terminal:

```bash
deno run -A npm:@hayodev/create-litium-accelerator 
```

### Step 3: Follow the Interactive Prompts

The `npx` or `deno run` command will interactively prompt you for all required information. Provide the requested details as per your development environment:

- **Project Path**: The directory where the project will be created.
- **Project Name**: Name of the Litium project.
- **SQL Server Docker Container Name**: Name of the Docker container running SQL Server (default: `sqlserver-1`).
- **Database Name**: Name for the SQL Server database.
- **SQL Server Address**: Host address of the SQL Server (default: `localhost`).
- **SQL Server Port**: Port number for SQL Server (default: `1433`).
- **SQL Server Username**: Username for SQL Server authentication (default: `sa`).
- **SQL Server Password**: Password for SQL Server authentication (default: `Pass@word`).
- **Application URL and Ports**: The URL and ports where the application will be accessible.
- **Litium Admin Credentials**: Admin username and password for Litium back office.
- **Project Type**: Choose between `MVC` or `Headless`.

### Step 4: Wait for the Setup to Complete

The setup process will:

- Install necessary dependencies.
- Configure your project according to the provided details.
- Set up the database and run migrations.
- Add a Litium admin user.
- Start the .NET server.
- For **Headless** projects:
  - Set up the React frontend.
  - Import definitions using `litium-storefront` tool.
  - Export translations.

### Step 5: Access the Litium Back Office

Once the setup completes, you can access the Litium back office at:

```
https://<application-url>:<application-port-https>/litium
```

For example:

```
https://litiumaccelerator.localtest.me:5001/litium
```

Log in using the Litium admin credentials you provided during the setup.

## Troubleshooting

### Missing Dependencies

- **dotnet Not Found**: Ensure that .NET SDK is installed and the `dotnet` command is in your system's PATH.
- **docker Not Found**: Ensure that Docker is installed, running, and accessible from the command line.
- **npx Not Found**: Ensure that Node.js and NPM are installed, and `npx` is accessible.

### Node.js Version Mismatch

- The setup requires Node.js version **20.x**.
- Verify your Node.js version with `node -v` and install the correct version if necessary.

### Docker Issues

- **SQL Server Container Not Found**: Ensure that the SQL Server Docker container is running and named correctly.
- **Cannot Connect to SQL Server**: Verify that the container is accessible and that ports are correctly mapped.
- **Mac Users**: There is a known issue with the `dnsresolver` container in Docker Desktop versions 4.24 and newer. Refer to Docker's release notes for more information and workarounds.

### Port Conflicts

- If the default ports are in use, specify different ports during the setup prompts.
- Ensure no other services are running on the same ports.

### Database Already Exists

- If the database already exists, the setup will prompt you to overwrite it.
- Choose to overwrite or specify a different database name.

### Server Not Starting

- If the .NET server does not start, check for errors in the console output.
- Ensure that all dependencies are installed and the configuration is correct.

## Additional Information

### Litium Accelerators

Litium provides accelerators to help you get started quickly.

- **MVC Accelerator**:
  - Based on ASP.NET MVC.
  - Feature-rich and stable for years.
- **React Accelerator**:
  - Based on React and Next.js.
  - Uses Litium's headless commerce stack.

### Documentation

- [Litium Accelerator Installation Instructions](https://docs.litium.com/documentation/accelerator/install-litium-accelerator)
- [Shared Dependencies Setup](https://docs.litium.com/documentation/system-requirements/shared-dependencies)
- [Litium Packages Setup](https://docs.litium.com/documentation/system-requirements/litium-packages)

## Contributing

Contributions are welcome! Please visit the GitHub repository to report issues or submit pull requests.

- **GitHub Repository**: [HayoDev/create-litium-accelerator](https://github.com/HayoDev/create-litium-accelerator)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Conclusion

Using the `npx create-litium-accelerator` command is an approach to set up your Litium development environment efficiently. It streamlines the installation process and ensures that all components are correctly configured.

If you encounter any issues or need further assistance, refer to the troubleshooting section or consult the official Litium documentation.

Happy developing!

---

*Note: This README provides a comprehensive guide on using the `create-litium-accelerator` package to set up a Litium project efficiently.*