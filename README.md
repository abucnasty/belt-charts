# belt-charts

A CLI tool for generating charts and visualizations from Belt benchmark verbose metrics data.

## Installation

### From npm (once published)
```bash
npm install -g belt-charts
```

### For Development
```bash
npm install
npm run build
npm link
```

## Usage

After installation, the `belt-charts` command will be globally available:

```bash
belt-charts --help
```


## Bare Bones Documentation
Example usages. Let's assume you have the following metric files in a nested folder called "results"

1. my_amazing_map_fast
2. my_amazing_map_slow

Run Distribution (boxplot)
```
belt-charts boxplot "results/my_amazing_map*.csv"
  -w 1000
  -h 800
  --remove-first-ticks 30
  -o "charts/run_distribution.png"
  --trim-prefix "my_amazing_map_"
```

Summary Chart:
```
belt-charts summary "results/my_amazing_map*.csv"
  --title-override "All Metrics"
  -w 1500
  -h 800
  --remove-first-ticks 30
  -o "charts/all_metrics.png"
  --aggregate-strategy average
  --metrics "wholeUpdate,entityUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate"
  --summary-table true
  --trim-prefix "my_amazing_map_"
  --summary-table-file true
```

Summary Per-Run Chart (shows individual runs instead of averaging):
```
belt-charts summary-per-run "results/my_amazing_map*.csv"
  -w 2000
  -h 1000
  --remove-first-ticks 30
  -o "charts/per_run_metrics.png"
  --aggregate-strategy average
  --metrics "wholeUpdate,entityUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate"
  --summary-table true
  --summary-table-file true
  --trim-prefix "my_amazing_map_"
  --sort-by total
```

Timeseries graphs:
```
belt-charts bar "results/my_amazing_map*.csv"
  -w 1200
  -h 800
  --remove-first-ticks 30
  -o "charts/timeseries.png"
  -a "average"
  --max-ticks 18000
  --max-update 3000
  --trim-prefix "my_amazing_map_"
  --metrics "wholeUpdate,controlBehaviorUpdate,transportLinesUpdate,electricHeatFluidCircuitUpdate,electricNetworkUpdate,entityUpdate"
  --tick-window-aggregation 60
```

## Publishing to npm

### Prerequisites
1. Create an npm account at https://www.npmjs.com
2. Log in to npm from the command line:
   ```bash
   npm login
   ```

### Publishing Steps

1. **Update CHANGELOG.md**:
   - Move items from `[Unreleased]` section to a new version section
   - Follow [Keep a Changelog](https://keepachangelog.com/) format
   - Organize changes under: Added, Changed, Deprecated, Removed, Fixed, Security
   - Add the release date

2. **Update version** (follow semantic versioning):
   ```bash
   npm version patch  # for bug fixes (1.0.0 -> 1.0.1)
   npm version minor  # for new features (1.0.0 -> 1.1.0)
   npm version major  # for breaking changes (1.0.0 -> 2.0.0)
   ```

3. **Test the package locally**:
   ```bash
   npm run test:install
   ```
   This creates a tarball and installs it globally to test.

4. **Publish to npm**:
   ```bash
   npm publish
   ```

5. **Verify the package**:
   ```bash
   npm view belt-charts
   ```

### Package Configuration

The package is configured for maximum compatibility:
- **Node.js**: Requires Node.js 14.0.0 or higher
- **Format**: Bundled as CommonJS for broad compatibility
- **OS Support**: Cross-platform (Linux, macOS, Windows)
- **Binary Dependencies**: Includes native bindings (skia-canvas) bundled in the package

## Development

### Available Scripts

- `npm run build` - Build the project (TypeScript → bundled CommonJS)
- `npm run dev` - Watch mode for development
- `npm run start` - Run the built CLI
- `npm pack` - Create a tarball to test packaging
- `npm run test:install` - Pack and install globally for testing

### Project Structure

- `src/` - TypeScript source files
- `dist/` - Bundled output (created by build)
- `bin/` - CLI wrapper script
- `charts/` - Example output files (not included in npm package)

## Requirements

- Node.js >= 14.0.0
- npm or yarn

## License

MIT