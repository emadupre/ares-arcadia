import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnomalyTrigger,
  ArcadiaMacroGrid,
  DeployableRepeater,
  PoiStation,
  RoverTelemetry,
  SafetyWorkerTickOutput,
} from '../types/mission';

export function useSafetyCore(grid: ArcadiaMacroGrid | null, pois: PoiStation[] = []) {
  const workerRef = useRef<Worker | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [heartbeatTick, setHeartbeatTick] = useState(0);
  const [safetyOutput, setSafetyOutput] = useState<SafetyWorkerTickOutput | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/safetyCritical.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'READY') {
        setWorkerReady(true);
      } else if (e.data.type === 'HEARTBEAT') {
        setHeartbeatTick(e.data.heartbeatTick);
      } else if (e.data.type === 'TICK_RESULT') {
        setSafetyOutput(e.data.output as SafetyWorkerTickOutput);
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (grid && workerRef.current) {
      workerRef.current.postMessage({ type: 'INIT_GRID', grid, pois });
    }
  }, [grid, pois]);

  const sendTick = useCallback(
    (payload: {
      dtSec: number;
      simElapsedSec: number;
      x: number;
      y: number;
      speedMs: number;
      slopeDeg: number;
      astronautMassKg: number;
      sampleMassKg: number;
      alaraBudgetMicroSv: number;
      stiffnessKThetaNmRad?: number;
      suitDeltaPKpa?: number;
      anomaly: AnomalyTrigger;
      dustTau: number;
      ambientTempC?: number;
      speActive: boolean;
      sosActive: boolean;
      rover: RoverTelemetry;
      buddyX: number;
      buddyY: number;
      headingDriftCount: number;
      unacknowledgedAlertSec: number;
      repeaters?: DeployableRepeater[];
      roverCommsFault?: boolean;
      forceReset?: boolean;
      clearAnomaly?: boolean;
    }) => {
      if (!workerRef.current || !workerReady) return;
      workerRef.current.postMessage({ type: 'TICK', payload });
    },
    [workerReady]
  );

  const clearWorkerEmergencyState = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'CLEAR_EMERGENCY' });
    }
    setSafetyOutput((prev) =>
      prev
        ? {
            ...prev,
            o2RemainingMin: Math.max(prev.o2RemainingMin, 192),
            o2Percent: Math.max(prev.o2Percent, 80),
            batteryPercent: Math.max(prev.batteryPercent, 78),
            suitDeltaPKpa: 29.0,
            heartRateBpm: Math.min(prev.heartRateBpm, 76),
            co2MmHg: Math.min(prev.co2MmHg, 3.1),
            hypercapniaAlert: false,
            hypercapniaReason: null,
            alaraBudgetPct: Math.min(prev.alaraBudgetPct, 65),
            returnMarginMin: Math.max(prev.returnMarginMin, 60),
            returnStatusColor: 'cyan',
            tunnelVisionMode: false,
            executiveOrder: 'SEGUIR CORREDOR',
          }
        : null
    );
  }, []);

  const switchPlssBackupLoop = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'SWITCH_PLSS_BACKUP' });
    }
    setSafetyOutput((prev) =>
      prev
        ? {
            ...prev,
            plssBackupActive: true,
            hypercapniaAlert: false,
            hypercapniaReason: null,
            co2MmHg: Number(Math.min(prev.co2MmHg, 2.1).toFixed(1)),
          }
        : null
    );
  }, []);

  return { workerReady, heartbeatTick, safetyOutput, sendTick, clearWorkerEmergencyState, switchPlssBackupLoop };
}
