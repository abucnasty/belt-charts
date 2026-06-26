export const MetricEnum = {
    WHOLE_UPDATE: {
        name: "wholeUpdate",
        description: "Whole Update"
    },
    LATENCY_UPDATE: {
        name: "latencyUpdate",
        description: "Latency Update"
    },
    GAME_UPDATE: {
        name: "gameUpdate",
        description: "Game Update"
    },
    PLANETS_UPDATE: {
        name: "planetsUpdate",
        description: "Planets Update"
    },
    CONTROL_BEHAVIOR_UPDATE: {
        name: "controlBehaviorUpdate",
        description: "Control Behavior Update"
    },
    TRANSPORT_LINES_UPDATE: {
        name: "transportLinesUpdate",
        description: "Transport Lines Update"
    },
    ELECTRIC_HEAT_FLUID_CIRCUIT_UPDATE: {
        name: "electricHeatFluidCircuitUpdate",
        description: "Electric/Heat/Fluid Circuit Update"
    },
    ELECTRIC_NETWORK_UPDATE: {
        name: "electricNetworkUpdate",
        description: "Electric Network Update"
    },
    HEAT_NETWORK_UPDATE: {
        name: "heatNetworkUpdate",
        description: "Heat Network Update"
    },
    FLUID_FLOW_UPDATE: {
        name: "fluidFlowUpdate",
        description: "Fluid Flow Update"
    },
    ENTITY_UPDATE: {
        name: "entityUpdate",
        description: "Entity Update"
    },
    LIGHTNING_UPDATE: {
        name: "lightningUpdate",
        description: "Lightning Update"
    },
    TILE_HEATING_UPDATE: {
        name: "tileHeatingUpdate",
        description: "Tile Heating Update"
    },
    PARTICLE_UPDATE: {
        name: "particleUpdate",
        description: "Particle Update"
    },
    POLLUTION_UPDATE: {
        name: "pollutionUpdate",
        description: "Pollution Update"
    },
    MAP_GENERATOR: {
        name: "mapGenerator",
        description: "Map Generator"
    },
    MAP_GENERATOR_BASIC_TILES_SUPPORT_COMPUTE: {
        name: "mapGeneratorBasicTilesSupportCompute",
        description: "Map Generator Basic Tiles Support Compute"
    },
    MAP_GENERATOR_BASIC_TILES_SUPPORT_APPLY: {
        name: "mapGeneratorBasicTilesSupportApply",
        description: "Map Generator Basic Tiles Support Apply"
    },
    MAP_GENERATOR_CORRECTED_TILES_PREPARE: {
        name: "mapGeneratorCorrectedTilesPrepare",
        description: "Map Generator Corrected Tiles Prepare"
    },
    MAP_GENERATOR_CORRECTED_TILES_COMPUTE: {
        name: "mapGeneratorCorrectedTilesCompute",
        description: "Map Generator Corrected Tiles Compute"
    },
    MAP_GENERATOR_CORRECTED_TILES_APPLY: {
        name: "mapGeneratorCorrectedTilesApply",
        description: "Map Generator Corrected Tiles Apply"
    },
    MAP_GENERATOR_VARIATIONS: {
        name: "mapGeneratorVariations",
        description: "Map Generator Variations"
    },
    MAP_GENERATOR_ENTITIES_PREPARE: {
        name: "mapGeneratorEntitiesPrepare",
        description: "Map Generator Entities Prepare"
    },
    MAP_GENERATOR_ENTITIES_COMPUTE: {
        name: "mapGeneratorEntitiesCompute",
        description: "Map Generator Entities Compute"
    },
    MAP_GENERATOR_ENTITIES_APPLY: {
        name: "mapGeneratorEntitiesApply",
        description: "Map Generator Entities Apply"
    },
    SPACE_PLATFORMS: {
        name: "spacePlatforms",
        description: "Space Platforms"
    },
    COLLECTOR_NAV_MESH: {
        name: "collectorNavMesh",
        description: "Collector Nav Mesh"
    },
    COLLECTOR_NAV_MESH_PATHFINDING: {
        name: "collectorNavMeshPathfinding",
        description: "Collector Nav Mesh Pathfinding"
    },
    COLLECTOR_NAV_MESH_RAYCAST: {
        name: "collectorNavMeshRaycast",
        description: "Collector Nav Mesh Raycast"
    },
    CRC_COMPUTATION: {
        name: "crcComputation",
        description: "Crc Computation"
    },
    CONSISTENCY_SCRAPER: {
        name: "consistencyScraper",
        description: "Consistency Scraper"
    },
    LOGISTIC_MANAGER_UPDATE: {
        name: "logisticManagerUpdate",
        description: "Logistic Manager Update"
    },
    CONSTRUCTION_MANAGER_UPDATE: {
        name: "constructionManagerUpdate",
        description: "Construction Manager Update"
    },
    PATH_FINDER: {
        name: "pathFinder",
        description: "Path Finder"
    },
    TRAINS: {
        name: "trains",
        description: "Trains"
    },
    TRAIN_PATH_FINDER: {
        name: "trainPathFinder",
        description: "Train Path Finder"
    },
    COMMANDER: {
        name: "commander",
        description: "Commander"
    },
    CHART_REFRESH: {
        name: "chartRefresh",
        description: "Chart Refresh"
    },
    LUA_GARBAGE_INCREMENTAL: {
        name: "luaGarbageIncremental",
        description: "Lua Garbage Incremental"
    },
    TURRET_TARGET_ACQUISITION: {
        name: "turretTargetAcquisition",
        description: "Turret Target Acquisition"
    },
    CHART_UPDATE: {
        name: "chartUpdate",
        description: "Chart Update"
    },
    SCRIPT_UPDATE: {
        name: "scriptUpdate",
        description: "Script Update"
    },
    OTHER: {
        name: "other",
        description: "Other"
    },
    // entityUpdate children (PascalCase metrics exposed by Factorio benchmark verbose metrics)
    LOGISTIC_ROBOT: { name: "LogisticRobot", description: "Logistic Robot", parent: "entityUpdate" },
    CONSTRUCTION_ROBOT: { name: "ConstructionRobot", description: "Construction Robot", parent: "entityUpdate" },
    INSERTER: { name: "Inserter", description: "Inserter", parent: "entityUpdate" },
    ROBOPORT: { name: "Roboport", description: "Roboport", parent: "entityUpdate" },
    LOADER: { name: "Loader", description: "Loader", parent: "entityUpdate" },
    ASSEMBLING_MACHINE: { name: "AssemblingMachine", description: "Assembly Machine", parent: "entityUpdate" },
    AGRICULTURAL_TOWER: { name: "AgriculturalTower", description: "Agricultural Tower", parent: "entityUpdate" },
    OLD_AGRICULTURAL_TOWER: { name: "OldAgriculturalTower", description: "Old Agricultural Tower", parent: "entityUpdate" },
    FURNACE: { name: "Furnace", description: "Furnace", parent: "entityUpdate" },
    MINING_DRILL: { name: "MiningDrill", description: "Mining Drill", parent: "entityUpdate" },
    FLUID_WAGON: { name: "FluidWagon", description: "Fluid Wagon", parent: "entityUpdate" },
    ARTILLERY_WAGON: { name: "ArtilleryWagon", description: "Artillery Wagon", parent: "entityUpdate" },
    INFINITY_CARGO_WAGON: { name: "InfinityCargoWagon", description: "Infinity Cargo Wagon", parent: "entityUpdate" },
    CARGO_WAGON: { name: "CargoWagon", description: "Cargo Wagon", parent: "entityUpdate" },
    LOCOMOTIVE: { name: "Locomotive", description: "Locomotive", parent: "entityUpdate" },
    CHARACTER: { name: "Character", description: "Character", parent: "entityUpdate" },
    BOILER: { name: "Boiler", description: "Boiler", parent: "entityUpdate" },
    GENERATOR: { name: "Generator", description: "Generator", parent: "entityUpdate" },
    BURNER_GENERATOR: { name: "BurnerGenerator", description: "Burner Generator", parent: "entityUpdate" },
    REACTOR: { name: "Reactor", description: "Reactor", parent: "entityUpdate" },
    LAB: { name: "Lab", description: "Lab", parent: "entityUpdate" },
    LAND_MINE: { name: "LandMine", description: "Land Mine", parent: "entityUpdate" },
    ARTILLERY_FLARE: { name: "ArtilleryFlare", description: "Artillery Flare", parent: "entityUpdate" },
    ARTILLERY_PROJECTILE: { name: "ArtilleryProjectile", description: "Artillery Projectile", parent: "entityUpdate" },
    ARTILLERY_TURRET: { name: "ArtilleryTurret", description: "Artillery Turret", parent: "entityUpdate" },
    BEAM: { name: "Beam", description: "Beam", parent: "entityUpdate" },
    CAR: { name: "Car", description: "Car", parent: "entityUpdate" },
    SPIDER_VEHICLE: { name: "SpiderVehicle", description: "Spider Vehicle", parent: "entityUpdate" },
    TEMPORARY_CONTAINER: { name: "TemporaryContainer", description: "Temporary Container", parent: "entityUpdate" },
    CHARACTER_CORPSE: { name: "CharacterCorpse", description: "Character Corpse", parent: "entityUpdate" },
    COMBAT_ROBOT: { name: "CombatRobot", description: "Combat Robot", parent: "entityUpdate" },
    CAPTURE_ROBOT: { name: "CaptureRobot", description: "Capture Robot", parent: "entityUpdate" },
    CORPSE: { name: "Corpse", description: "Corpse", parent: "entityUpdate" },
    ELECTRIC_ENERGY_INTERFACE: { name: "ElectricEnergyInterface", description: "Electric Energy Interface", parent: "entityUpdate" },
    ENEMY_SPAWNER: { name: "EnemySpawner", description: "Enemy Spawner", parent: "entityUpdate" },
    EXPLOSION: { name: "Explosion", description: "Explosion", parent: "entityUpdate" },
    FLAME_THROWER_EXPLOSION: { name: "FlameThrowerExplosion", description: "Flame Thrower Explosion", parent: "entityUpdate" },
    FLUID_STREAM: { name: "FluidStream", description: "Fluid Stream", parent: "entityUpdate" },
    FLUID_TURRET: { name: "FluidTurret", description: "Fluid Turret", parent: "entityUpdate" },
    FLYING_TEXT_ENTITY: { name: "FlyingTextEntity", description: "Flying Text Entity", parent: "entityUpdate" },
    FUSION_GENERATOR: { name: "FusionGenerator", description: "Fusion Generator", parent: "entityUpdate" },
    FUSION_REACTOR: { name: "FusionReactor", description: "Fusion Reactor", parent: "entityUpdate" },
    GATE: { name: "Gate", description: "Gate", parent: "entityUpdate" },
    HEAT_INTERFACE: { name: "HeatInterface", description: "Heat Interface", parent: "entityUpdate" },
    HIGHLIGHT_BOX_ENTITY: { name: "HighlightBoxEntity", description: "Highlight Box Entity", parent: "entityUpdate" },
    INFINITY_CONTAINER: { name: "InfinityContainer", description: "Infinity Container", parent: "entityUpdate" },
    INFINITY_PIPE: { name: "InfinityPipe", description: "Infinity Pipe", parent: "entityUpdate" },
    ITEM_REQUEST_PROXY: { name: "ItemRequestProxy", description: "Item Request Proxy", parent: "entityUpdate" },
    OFFSHORE_PUMP: { name: "OffshorePump", description: "Offshore Pump", parent: "entityUpdate" },
    PARTICLE_SOURCE: { name: "ParticleSource", description: "Particle Source", parent: "entityUpdate" },
    POWER_SWITCH: { name: "PowerSwitch", description: "Power Switch", parent: "entityUpdate" },
    PROJECTILE: { name: "Projectile", description: "Projectile", parent: "entityUpdate" },
    PUMP: { name: "Pump", description: "Pump", parent: "entityUpdate" },
    VALVE: { name: "Valve", description: "Valve", parent: "entityUpdate" },
    RADAR: { name: "Radar", description: "Radar", parent: "entityUpdate" },
    PROGRAMMABLE_SPEAKER: { name: "ProgrammableSpeaker", description: "Programmable Speaker", parent: "entityUpdate" },
    ROCKET_SILO: { name: "RocketSilo", description: "Rocket Silo", parent: "entityUpdate" },
    ROCKET_SILO_ROCKET: { name: "RocketSiloRocket", description: "Rocket Silo Rocket", parent: "entityUpdate" },
    CARGO_POD: { name: "CargoPod", description: "Cargo Pod", parent: "entityUpdate" },
    SMOKE_WITH_TRIGGER: { name: "SmokeWithTrigger", description: "Smoke With Trigger", parent: "entityUpdate" },
    SPEECH_BUBBLE: { name: "SpeechBubble", description: "Speech Bubble", parent: "entityUpdate" },
    STICKER: { name: "Sticker", description: "Sticker", parent: "entityUpdate" },
    TURRET: { name: "Turret", description: "Turret", parent: "entityUpdate" },
    ASTEROID_COLLECTOR: { name: "AsteroidCollector", description: "Asteroid Collector", parent: "entityUpdate" },
    ASTEROID: { name: "Asteroid", description: "Asteroid", parent: "entityUpdate" },
    THRUSTER: { name: "Thruster", description: "Thruster", parent: "entityUpdate" },
    SPIDER_UNIT: { name: "SpiderUnit", description: "Spider Unit", parent: "entityUpdate" },
    UNIT: { name: "Unit", description: "Unit", parent: "entityUpdate" },
} as const;

export type MetricEnum = typeof MetricEnum[keyof typeof MetricEnum];