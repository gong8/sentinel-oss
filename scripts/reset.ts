#!/usr/bin/env npx tsx
/**
 * SENTINEL Reset - Cross-platform full reset
 * Destroys all data and resets to clean state
 */
import $ from 'dax-sh';
import { blue, bold, green, yellow } from './lib/colors.js';
import { getEnvValue } from './lib/env.js';

async function main() {
  console.log(blue('SENTINEL Reset'));
  console.log();
  console.log(yellow(bold('This will destroy ALL data and reset to a clean state:')));
  console.log('  - Stop and remove all containers');
  console.log('  - Delete all Docker volumes (DATABASE WILL BE WIPED)');
  console.log('  - Remove Docker images');
  console.log('  - Delete .env file');
  console.log('  - Remove node_modules (optional)');
  console.log();

  const confirm = await $.prompt("Are you sure? Type 'reset' to confirm:");
  if (confirm !== 'reset') {
    console.log('Cancelled.');
    process.exit(0);
  }

  console.log();
  console.log(blue('Stopping containers...'));
  await $`docker compose down --remove-orphans`.noThrow();

  console.log(blue('Removing volumes...'));
  await $`docker compose down -v`.noThrow();

  console.log(blue('Removing images...'));
  await $`docker compose down --rmi local`.noThrow();

  console.log(blue('Removing .env...'));

  // Check for custom hostname in .env before deleting
  const envPath = $.path('.env');
  if (await envPath.exists()) {
    const frontendUrl = await getEnvValue('FRONTEND_URL');
    if (frontendUrl) {
      // Extract host from URL
      const host = frontendUrl
        .replace(/^https?:\/\//, '')
        .split(':')[0]
        .split('/')[0];

      // Check if it's a simple hostname (no dots) that we might have added to hosts
      if (host !== 'localhost' && !host.includes('.')) {
        // Check if host is in /etc/hosts (Unix) or hosts file (Windows)
        const isWindows = process.platform === 'win32';
        const hostsPath = isWindows
          ? `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\drivers\\etc\\hosts`
          : '/etc/hosts';

        try {
          const hostsContent = await $.path(hostsPath).readText();
          if (hostsContent.match(new RegExp(`^127\\.0\\.0\\.1\\s+${host}`, 'm'))) {
            console.log(blue(`Found '${host}' in hosts file (added during setup)`));
            const removeHost = await $.confirm(
              `Remove '${host}' from hosts file? (requires admin)`,
            );

            if (removeHost) {
              const newContent = hostsContent
                .split('\n')
                .filter((line) => !line.match(new RegExp(`^127\\.0\\.0\\.1\\s+${host}$`)))
                .join('\n');

              if (isWindows) {
                // On Windows, need to run as admin
                console.log(
                  yellow('Please manually remove the hosts entry or run as Administrator'),
                );
              } else {
                // On Unix, use sudo
                await $`sudo tee ${hostsPath}`.stdinText(newContent).quiet();
                console.log(green(`✓ Removed '${host}' from hosts file`));
              }
            }
          }
        } catch {
          // Ignore hosts file errors
        }
      }
    }
  }

  await envPath.remove().catch(() => {});

  console.log();
  const removeModules = await $.confirm('Also remove node_modules?');

  if (removeModules) {
    console.log(blue('Removing node_modules...'));
    await $.path('node_modules')
      .remove({ recursive: true })
      .catch(() => {});

    // Remove node_modules from packages
    const packagesDir = $.path('packages');
    if (await packagesDir.exists()) {
      for await (const entry of packagesDir.readDir()) {
        if (entry.isDirectory) {
          const pkgModules = packagesDir.join(entry.name, 'node_modules');
          await pkgModules.remove({ recursive: true }).catch(() => {});
        }
      }
    }
    console.log(green('✓ Removed node_modules'));
  }

  console.log();
  console.log(green('Reset complete!'));
  console.log();
  console.log('To start fresh, run:');
  console.log('  pnpm setup');
}

main().catch(console.error);
