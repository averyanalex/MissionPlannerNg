import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  downloadAllParams,
  writeParam,
  parseParamFile,
  formatParamFile,
  subscribeParamStore,
  subscribeParamProgress,
  type Param,
  type ParamStore,
  type ParamProgress,
} from "../params";
import { fetchParamMetadata, type ParamMetadataMap } from "../param-metadata";
import { save, open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";

function asErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "unexpected error";
}

export function useParams(connected: boolean, vehicleType?: string) {
  const [store, setStore] = useState<ParamStore | null>(null);
  const [progress, setProgress] = useState<ParamProgress | null>(null);
  const [search, setSearch] = useState("");
  const [editingParam, setEditingParam] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [metadata, setMetadata] = useState<ParamMetadataMap | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const lastFetchedType = useRef<string | undefined>();

  // Subscribe to param events
  useEffect(() => {
    let stopStore: (() => void) | null = null;
    let stopProgress: (() => void) | null = null;

    (async () => {
      stopStore = await subscribeParamStore(setStore);
      stopProgress = await subscribeParamProgress(setProgress);
    })();

    return () => {
      stopStore?.();
      stopProgress?.();
    };
  }, []);

  // Clear store on disconnect
  useEffect(() => {
    if (!connected) {
      setStore(null);
      setProgress(null);
      setEditingParam(null);
      setMetadata(null);
      lastFetchedType.current = undefined;
    }
  }, [connected]);

  // Fetch metadata when vehicle type becomes known
  useEffect(() => {
    if (!vehicleType || vehicleType === lastFetchedType.current) return;
    lastFetchedType.current = vehicleType;
    let cancelled = false;
    setMetadataLoading(true);
    fetchParamMetadata(vehicleType)
      .then((result) => {
        if (!cancelled) {
          setMetadata(result);
          if (result) {
            toast.success("Parameter descriptions loaded", {
              description: `${result.size} definitions`,
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.warning("Could not load parameter descriptions");
        }
      })
      .finally(() => {
        if (!cancelled) setMetadataLoading(false);
      });
    return () => { cancelled = true; };
  }, [vehicleType]);

  const paramList = useMemo(() => {
    if (!store) return [];
    return Object.values(store.params).sort((a, b) => a.name.localeCompare(b.name));
  }, [store]);

  const filteredParams = useMemo(() => {
    if (!search) return paramList;
    const term = search.toLowerCase();
    return paramList.filter((p) => {
      if (p.name.toLowerCase().includes(term)) return true;
      if (metadata) {
        const meta = metadata.get(p.name);
        if (meta) {
          if (meta.description.toLowerCase().includes(term)) return true;
          if (meta.humanName.toLowerCase().includes(term)) return true;
        }
      }
      return false;
    });
  }, [paramList, search, metadata]);

  const groupedParams = useMemo(() => {
    const groups: Record<string, Param[]> = {};
    for (const param of filteredParams) {
      const prefix = param.name.split("_")[0] || param.name;
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(param);
    }
    return groups;
  }, [filteredParams]);

  const download = useCallback(async () => {
    if (!connected) {
      toast.error("Connect to vehicle first");
      return;
    }
    try {
      const result = await downloadAllParams();
      toast.success("Parameters downloaded", {
        description: `${Object.keys(result.params).length} parameters`,
      });
    } catch (err) {
      toast.error("Parameter download failed", { description: asErrorMessage(err) });
    }
  }, [connected]);

  const write = useCallback(
    async (name: string, value: number) => {
      if (!connected) {
        toast.error("Connect to vehicle first");
        return;
      }
      try {
        const confirmed = await writeParam(name, value);
        // Optimistically update local store
        setStore((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            params: { ...prev.params, [name]: confirmed },
          };
        });
        toast.success(`${name} = ${confirmed.value}`);
      } catch (err) {
        toast.error(`Failed to write ${name}`, { description: asErrorMessage(err) });
      }
    },
    [connected],
  );

  const saveToFile = useCallback(async () => {
    if (!store) {
      toast.error("No parameters to save");
      return;
    }
    try {
      const path = await save({
        filters: [{ name: "Parameter File", extensions: ["param"] }],
        defaultPath: "params.param",
      });
      if (!path) return;
      const contents = await formatParamFile(store);
      await writeTextFile(path, contents);
      toast.success("Parameters saved", { description: path });
    } catch (err) {
      toast.error("Failed to save file", { description: asErrorMessage(err) });
    }
  }, [store]);

  const loadFromFile = useCallback(async () => {
    try {
      const path = await open({
        filters: [{ name: "Parameter File", extensions: ["param"] }],
        multiple: false,
      });
      if (!path) return;
      const contents = await readTextFile(path);
      const parsed = await parseParamFile(contents);
      const count = Object.keys(parsed).length;
      toast.success(`Loaded ${count} parameters from file`);
      return parsed;
    } catch (err) {
      toast.error("Failed to load file", { description: asErrorMessage(err) });
      return undefined;
    }
  }, []);

  return {
    store,
    progress,
    search,
    setSearch,
    editingParam,
    setEditingParam,
    editValue,
    setEditValue,
    paramList,
    filteredParams,
    groupedParams,
    download,
    write,
    saveToFile,
    loadFromFile,
    metadata,
    metadataLoading,
  };
}
