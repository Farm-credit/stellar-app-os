import React, { useState, useEffect } from 'react';
import { SatelliteMap } from './components/SatelliteMap';
import { TelemetryCard } from './components/TelemetryCard';
import { VerificationBadge } from './components/VerificationBadge';
import { Droplets, Thermometer, Bug, MapPin, TrendingUp } from 'lucide-react';
import { LatLngExpression } from 'leaflet';

// Mock farm location (Iowa farmland)
const FARM_CENTER: LatLngExpression = [42.0308, -93.6319];

// Mock health zones with NDVI values
const HEALTH_ZONES = [
  {
    id: 'zone-1',
    label: 'North Field',
    ndvi: 0.75,
    coordinates: [[
      [42.0340, -93.6380],
      [42.0340, -93.6300],
      [42.0320, -93.6300],
      [42.0320, -93.6380],
    ]],
  },
  {
    id: 'zone-2',
    label: 'Central Field',
    ndvi: 0.82,
    coordinates: [[
      [42.0320, -93.6380],
      [42.0320, -93.6300],
      [42.0300, -93.6300],
      [42.0300, -93.6380],
    ]],
  },
  {
    id: 'zone-3',
    label: 'South Field',
    ndvi: 0.45,
    coordinates: [[
      [42.0300, -93.6380],
      [42.0300, -93.6300],
      [42.0280, -93.6300],
      [42.0280, -93.6380],
    ]],
  },
  {
    id: 'zone-4',
    label: 'East Plot',
    ndvi: 0.25,
    coordinates: [[
      [42.0340, -93.6300],
      [42.0340, -93.6250],
      [42.0280, -93.6250],
      [42.0280, -93.6300],
    ]],
  },
];

// Generate mock historical data
const generateTrendData = (baseValue: number, variance: number, points: number = 24) => {
  return Array.from({ length: points }, (_, i) => ({
    value: baseValue + (Math.random() - 0.5) * variance,
  }));
};

function App() {
  const [telemetryData, setTelemetryData] = useState({
    soilMoisture: {
      value: 68,
      unit: '%',
      status: 'good' as const,
      trendData: generateTrendData(68, 10),
    },
    temperature: {
      value: 22.5,
      unit: '°C',
      status: 'good' as const,
      trendData: generateTrendData(22.5, 5),
    },
    pestRisk: {
      value: 12,
      unit: '%',
      status: 'good' as const,
      trendData: generateTrendData(12, 8),
    },
  });

  const [lastVerified] = useState(new Date(Date.now() - 8 * 60 * 60 * 1000)); // 8 hours ago

  // Simulate live data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetryData((prev) => ({
        soilMoisture: {
          ...prev.soilMoisture,
          value: Math.max(0, Math.min(100, prev.soilMoisture.value + (Math.random() - 0.5) * 2)),
          trendData: [
            ...prev.soilMoisture.trendData.slice(1),
            { value: prev.soilMoisture.value },
          ],
        },
        temperature: {
          ...prev.temperature,
          value: Math.max(10, Math.min(40, prev.temperature.value + (Math.random() - 0.5) * 0.5)),
          trendData: [
            ...prev.temperature.trendData.slice(1),
            { value: prev.temperature.value },
          ],
        },
        pestRisk: {
          ...prev.pestRisk,
          value: Math.max(0, Math.min(100, prev.pestRisk.value + (Math.random() - 0.5) * 3)),
          trendData: [
            ...prev.pestRisk.trendData.slice(1),
            { value: prev.pestRisk.value },
          ],
        },
      }));
    }, 3000); // Update every 3 seconds

    return () => clearInterval(interval);
  }, []);

  // Calculate average NDVI
  const averageNDVI = (
    HEALTH_ZONES.reduce((sum, zone) => sum + zone.ndvi, 0) / HEALTH_ZONES.length
  ).toFixed(2);

  const getCurrentTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const [currentTime, setCurrentTime] = useState(getCurrentTime());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getCurrentTime());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <MapPin className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Green Valley Organic Farm
                </h1>
                <p className="text-gray-600 mb-3">
                  Real-time farm verification and health monitoring powered by blockchain oracles
                </p>
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Location:</span>
                    <span className="font-medium text-gray-900">Iowa, USA</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Farm ID:</span>
                    <span className="font-mono font-medium text-gray-900">0xA7F3...92B4</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Area:</span>
                    <span className="font-medium text-gray-900">125 hectares</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end mb-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-600">Live</span>
              </div>
              <p className="text-2xl font-mono font-bold text-gray-900">{currentTime}</p>
              <p className="text-xs text-gray-500 mt-1">Central Time</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-200">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Avg NDVI</p>
              <p className="text-2xl font-bold text-green-600">{averageNDVI}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Active Sensors</p>
              <p className="text-2xl font-bold text-blue-600">24</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Data Points/Day</p>
              <p className="text-2xl font-bold text-purple-600">1,440</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Investment Status</p>
              <p className="text-2xl font-bold text-green-600">Active</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Map */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  Satellite Viewport & Health Overlay
                </h2>
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">NDVI Active</span>
                </div>
              </div>
              <div className="h-[500px] rounded-lg overflow-hidden">
                <SatelliteMap
                  farmName="Green Valley Organic Farm"
                  center={FARM_CENTER}
                  healthZones={HEALTH_ZONES}
                />
              </div>
            </div>

            {/* Telemetry Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TelemetryCard
                title="Soil Moisture"
                value={telemetryData.soilMoisture.value.toFixed(1)}
                unit="%"
                icon={Droplets}
                status={telemetryData.soilMoisture.status}
                trendData={telemetryData.soilMoisture.trendData}
                lastUpdate="2s ago"
              />
              <TelemetryCard
                title="Temperature"
                value={telemetryData.temperature.value.toFixed(1)}
                unit="°C"
                icon={Thermometer}
                status={telemetryData.temperature.status}
                trendData={telemetryData.temperature.trendData}
                lastUpdate="2s ago"
              />
              <TelemetryCard
                title="Pest Risk Level"
                value={telemetryData.pestRisk.value.toFixed(0)}
                unit="%"
                icon={Bug}
                status={telemetryData.pestRisk.status}
                trendData={telemetryData.pestRisk.trendData}
                lastUpdate="2s ago"
              />
            </div>
          </div>

          {/* Right Column - Verification */}
          <div className="space-y-6">
            <VerificationBadge
              lastVerified={lastVerified}
              oracleProvider="Chainlink Oracle Network"
              blockchainNetwork="Ethereum Mainnet"
            />

            {/* Additional Info Card */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Data Attestations</h3>
              <div className="space-y-3">
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">Crop Health</span>
                    <span className="text-xs text-green-600 font-semibold">Verified</span>
                  </div>
                  <p className="text-xs text-gray-600">Last update: 8h ago</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">Soil Quality</span>
                    <span className="text-xs text-green-600 font-semibold">Verified</span>
                  </div>
                  <p className="text-xs text-gray-600">Last update: 12h ago</p>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">Harvest Status</span>
                    <span className="text-xs text-yellow-600 font-semibold">Pending</span>
                  </div>
                  <p className="text-xs text-gray-600">Next update: 48h</p>
                </div>
              </div>
            </div>

            {/* Blockchain Info */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-lg p-6 border border-blue-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Smart Contract</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-600">Contract Address:</span>
                  <p className="font-mono text-xs text-gray-900 mt-1 break-all">
                    0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Oracle Job ID:</span>
                  <p className="font-mono text-xs text-gray-900 mt-1 break-all">
                    a7f39c8d92b4e5f1c3d8a6e2b9f4d7c1
                  </p>
                </div>
                <div className="pt-3 border-t border-blue-200">
                  <a 
                    href="#" 
                    className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
                    onClick={(e) => e.preventDefault()}
                  >
                    View on Etherscan →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
