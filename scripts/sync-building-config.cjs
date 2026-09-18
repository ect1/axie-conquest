const fs = require('node:fs');
const path = require('node:path');
const yaml = require('yaml');

const ymlPath = path.resolve(__dirname, '../src/game/config/building-config.yml');
const jsonPath = path.resolve(__dirname, '../src/game/config/building-config.json');

try {
  const content = fs.readFileSync(ymlPath, 'utf8');
  const parsed = yaml.parse(content);
  fs.writeFileSync(jsonPath, JSON.stringify(parsed, null, 2), 'utf8');
  console.log(`Successfully synced ${ymlPath} -> ${jsonPath}`);
} catch (error) {
  console.error('Failed to sync building-config.yml to json:', error);
  process.exit(1);
}
