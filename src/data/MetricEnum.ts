const WholeUpdate = {
    WHOLE_UPDATE: {
        name: "wholeUpdate",
        description: "Whole Update"
    }
} as const;

const LatencyUpdate = {
    LATENCY_UPDATE: {
        name: "latencyUpdate",
        description: "Latency Update"
    }
} as const;

const GameUpdate = {
    GAME_UPDATE: {
        name: "gameUpdate",
        description: "Game Update"
    }
} as const;

const PlanetsUpdate = {
    PLANETS_UPDATE: {
        name: "planetsUpdate",
        description: "Planets Update"
    }
} as const;

const ControlBehaviorUpdate = {
    CONTROL_BEHAVIOR_UPDATE: {
        name: "controlBehaviorUpdate",
        description: "Control Behavior Update"
    }
} as const;

const TransportLinesUpdate = {
    TRANSPORT_LINES_UPDATE: {
        name: "transportLinesUpdate",
        description: "Transport Lines Update"
    }
} as const;

const ElectricHeatFluidCircuitUpdate = {
    ELECTRIC_HEAT_FLUID_CIRCUIT_UPDATE: {
        name: "electricHeatFluidCircuitUpdate",
        description: "Electric/Heat/Fluid Circuit Update"
    }
} as const;

const ElectricNetworkUpdate = {
    ELECTRIC_NETWORK_UPDATE: {
        name: "electricNetworkUpdate",
        description: "Electric Network Update"
    }
} as const;

const HeatNetworkUpdate = {
    HEAT_NETWORK_UPDATE: {
        name: "heatNetworkUpdate",
        description: "Heat Network Update"
    }
} as const;

const FluidFlowUpdate = {
    FLUID_FLOW_UPDATE: {
        name: "fluidFlowUpdate",
        description: "Fluid Flow Update"
    }
} as const;

const EntityUpdate = {
    ENTITY_UPDATE: {
        name: "entityUpdate",
        description: "Entity Update"
    }
} as const;

const LightningUpdate = {
    LIGHTNING_UPDATE: {
        name: "lightningUpdate",
        description: "Lightning Update"
    }
} as const;

const TileHeatingUpdate = {
    TILE_HEATING_UPDATE: {
        name: "tileHeatingUpdate",
        description: "Tile Heating Update"
    }
} as const;

const ParticleUpdate = {
    PARTICLE_UPDATE: {
        name: "particleUpdate",
        description: "Particle Update"
    }
} as const;

const MapGenerator = {
    MAP_GENERATOR: {
        name: "mapGenerator",
        description: "Map Generator"
    }
} as const;

const MapGeneratorBasicTilesSupportApply = {
    MAP_GENERATOR_BASIC_TILES_SUPPORT_COMPUTE: {
        name: "mapGeneratorBasicTilesSupportCompute",
        description: "Map Generator Basic Tiles Support Compute"
    }
} as const;

const MapGeneratorBasicTilesSupportCompute = {
    MAP_GENERATOR_BASIC_TILES_SUPPORT_APPLY: {
        name: "mapGeneratorBasicTilesSupportApply",
        description: "Map Generator Basic Tiles Support Apply"
    }
} as const;

const MapGeneratorCorrectedTilesApply = {
    MAP_GENERATOR_CORRECTED_TILES_PREPARE: {
        name: "mapGeneratorCorrectedTilesPrepare",
        description: "Map Generator Corrected Tiles Prepare"
    }
} as const;

const MapGeneratorCorrectedTilesCompute = {
    MAP_GENERATOR_CORRECTED_TILES_COMPUTE: {
        name: "mapGeneratorCorrectedTilesCompute",
        description: "Map Generator Corrected Tiles Compute"
    }
} as const;

const MapGeneratorCorrectedTilesPrepare = {
    MAP_GENERATOR_CORRECTED_TILES_APPLY: {
        name: "mapGeneratorCorrectedTilesApply",
        description: "Map Generator Corrected Tiles Apply"
    }
} as const;

const MapGeneratorEntitiesApply = {
    MAP_GENERATOR_ENTITIES_APPLY: {
        name: "mapGeneratorEntitiesApply",
        description: "Map Generator Entities Apply"
    }
}

const MapGeneratorEntitiesCompute = {
    MAP_GENERATOR_ENTITIES_COMPUTE: {
        name: "mapGeneratorEntitiesCompute",
        description: "Map Generator Entities Compute"
    }
} as const;

const MapGeneratorEntitiesPrepare = {
    MAP_GENERATOR_ENTITIES_PREPARE: {
        name: "mapGeneratorEntitiesPrepare",
        description: "Map Generator Entities Prepare"
    }
} as const;

const MapGeneratorVariations = {
    MAP_GENERATOR_VARIATIONS: {
        name: "mapGeneratorVariations",
        description: "Map Generator Variations"
    }
} as const;

const SpacePlatforms = {
    SPACE_PLATFORMS: {
        name: "spacePlatforms",
        description: "Space Platforms"
    }
} as const;

const CollectorNavMesh = {
    COLLECTOR_NAV_MESH: {
        name: "collectorNavMesh",
        description: "Collector Nav Mesh"
    }
} as const;

const CollectorNavMeshPathfinding = {
    COLLECTOR_NAV_MESH_PATHFINDING: {
        name: "collectorNavMeshPathfinding",
        description: "Collector Nav Mesh Pathfinding"
    }
} as const;

const CollectorNavMeshRaycast = {
    COLLECTOR_NAV_MESH_RAYCAST: {
        name: "collectorNavMeshRaycast",
        description: "Collector Nav Mesh Raycast"
    }
} as const;

const CRCComputation = {
    CRC_COMPUTATION: {
        name: "crcComputation",
        description: "Crc Computation"
    }
} as const;

const ConsistencyScraper = {
    CONSISTENCY_SCRAPER: {
        name: "consistencyScraper",
        description: "Consistency Scraper"
    }
} as const;

const LogisticManagerUpdate = {
    LOGISTIC_MANAGER_UPDATE: {
        name: "logisticManagerUpdate",
        description: "Logistic Manager Update"
    }
} as const;

const ConstructionManagerUpdate = {
    CONSTRUCTION_MANAGER_UPDATE: {
        name: "constructionManagerUpdate",
        description: "Construction Manager Update"
    }
} as const;

const PathFinder = {
    PATH_FINDER: {
        name: "pathFinder",
        description: "Path Finder"
    }
} as const;

const Trains = {
    TRAINS: {
        name: "trains",
        description: "Trains"
    }
} as const;

const TrainPathFinder = {
    TRAIN_PATH_FINDER: {
        name: "trainPathFinder",
        description: "Train Path Finder"
    }
} as const;

const Commander = {
    COMMANDER: {
        name: "commander",
        description: "Commander"
    }
} as const;

const LuaGarbageIncremental = {
    LUA_GARBAGE_INCREMENTAL: {
        name: "luaGarbageIncremental",
        description: "Lua Garbage Incremental"
    }
} as const;

const ChartRefresh = {
    CHART_REFRESH: {
        name: "chartRefresh",
        description: "Chart Refresh"
    }
} as const;

const ChartUpdate = {
    CHART_UPDATE: {
        name: "chartUpdate",
        description: "Chart Update"
    }
} as const;

const ScriptUpdate = {
    SCRIPT_UPDATE: {
        name: "scriptUpdate",
        description: "Script Update"
    }
} as const;

const Other = {
    OTHER: {
        name: "other",
        description: "Other"
    }
} as const;

export const MetricEnum = {
    ...WholeUpdate,
    ...LatencyUpdate,
    ...GameUpdate,
    ...PlanetsUpdate,
    ...ControlBehaviorUpdate,
    ...TransportLinesUpdate,
    ...ElectricHeatFluidCircuitUpdate,
    ...ElectricNetworkUpdate,
    ...HeatNetworkUpdate,
    ...FluidFlowUpdate,
    ...EntityUpdate,
    ...LightningUpdate,
    ...TileHeatingUpdate,
    ...ParticleUpdate,
    ...MapGenerator,
    ...MapGeneratorBasicTilesSupportApply,
    ...MapGeneratorBasicTilesSupportCompute,
    ...MapGeneratorCorrectedTilesApply,
    ...MapGeneratorCorrectedTilesCompute,
    ...MapGeneratorCorrectedTilesPrepare,
    ...MapGeneratorEntitiesApply,
    ...MapGeneratorEntitiesCompute,
    ...MapGeneratorEntitiesPrepare,
    ...MapGeneratorVariations,
    ...SpacePlatforms,
    ...CollectorNavMesh,
    ...CollectorNavMeshPathfinding,
    ...CollectorNavMeshRaycast,
    ...CRCComputation,
    ...ConsistencyScraper,
    ...LogisticManagerUpdate,
    ...ConstructionManagerUpdate,
    ...PathFinder,
    ...Trains,
    ...TrainPathFinder,
    ...Commander,
    ...LuaGarbageIncremental,
    ...ChartRefresh,
    ...ChartUpdate,
    ...ScriptUpdate,
    ...Other
} as const;

export type MetricEnum = typeof MetricEnum[keyof typeof MetricEnum];