import { useState } from "react";
import { RefreshCw, Save, FolderOpen, ChevronRight, ChevronDown, Search, Check, X, RotateCw, Loader2 } from "lucide-react";
import type { useParams } from "../hooks/use-params";
import type { Param, ParamType } from "../params";
import type { ParamMeta, ParamMetadataMap } from "../param-metadata";

type ConfigPanelProps = {
  params: ReturnType<typeof useParams>;
  connected: boolean;
};

const INTEGER_TYPES: ParamType[] = ["uint8", "int8", "uint16", "int16", "uint32", "int32"];

function displayValue(param: Param): string {
  if (INTEGER_TYPES.includes(param.param_type)) {
    return String(Math.round(param.value));
  }
  return String(param.value);
}

function EnumEditor({
  meta,
  editValue,
  onEditChange,
  onConfirm,
  onCancel,
}: {
  meta: ParamMeta;
  editValue: string;
  onEditChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const currentCode = Number(editValue);
  const hasCurrentInValues = meta.values!.some((v) => v.code === currentCode);

  return (
    <div className="flex items-center gap-1">
      <select
        value={editValue}
        onChange={(e) => onEditChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
        className="w-44 rounded border border-accent-blue bg-bg-input px-1.5 py-0.5 text-xs font-mono text-text-primary"
      >
        {!hasCurrentInValues && (
          <option value={editValue}>{editValue} (custom)</option>
        )}
        {meta.values!.map((v) => (
          <option key={v.code} value={String(v.code)}>
            {v.code}: {v.label}
          </option>
        ))}
      </select>
      <button onClick={onConfirm} className="p-0.5 text-success hover:text-success/80" title="Confirm">
        <Check size={12} />
      </button>
      <button onClick={onCancel} className="p-0.5 text-danger hover:text-danger/80" title="Cancel">
        <X size={12} />
      </button>
    </div>
  );
}

function BitmaskEditor({
  meta,
  editValue,
  onEditChange,
  onConfirm,
  onCancel,
}: {
  meta: ParamMeta;
  editValue: string;
  onEditChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const currentVal = Math.round(Number(editValue)) || 0;

  const toggleBit = (bit: number) => {
    const mask = 1 << bit;
    const newVal = currentVal & mask ? currentVal & ~mask : currentVal | mask;
    onEditChange(String(newVal));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="w-16 text-xs font-mono text-text-muted">= {currentVal}</span>
        <button onClick={onConfirm} className="p-0.5 text-success hover:text-success/80" title="Confirm">
          <Check size={12} />
        </button>
        <button onClick={onCancel} className="p-0.5 text-danger hover:text-danger/80" title="Cancel">
          <X size={12} />
        </button>
      </div>
      <div className="ml-0 flex flex-col gap-0.5 sm:ml-56">
        {meta.bitmask!.map((b) => (
          <label key={b.bit} className="flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={(currentVal & (1 << b.bit)) !== 0}
              onChange={() => toggleBit(b.bit)}
              className="h-3 w-3 rounded border-border"
            />
            <span className="font-mono text-text-muted">bit {b.bit}</span>
            {b.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function TextEditor({
  meta,
  editValue,
  onEditChange,
  onConfirm,
  onCancel,
}: {
  meta?: ParamMeta;
  editValue: string;
  onEditChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm();
            if (e.key === "Escape") onCancel();
          }}
          step={meta?.increment}
          autoFocus
          className="w-28 rounded border border-accent-blue bg-bg-input px-1.5 py-0.5 text-xs font-mono text-text-primary"
        />
        <button onClick={onConfirm} className="p-0.5 text-success hover:text-success/80" title="Confirm">
          <Check size={12} />
        </button>
        <button onClick={onCancel} className="p-0.5 text-danger hover:text-danger/80" title="Cancel">
          <X size={12} />
        </button>
      </div>
      {meta?.range && (
        <span className="ml-0.5 text-[10px] text-text-muted">
          Range: {meta.range.min} – {meta.range.max}
          {meta.increment != null && ` (step ${meta.increment})`}
        </span>
      )}
    </div>
  );
}

function ParamRow({
  param,
  meta,
  isEditing,
  editValue,
  onStartEdit,
  onEditChange,
  onConfirm,
  onCancel,
}: {
  param: Param;
  meta?: ParamMeta;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Resolve display label for enum values
  const valueLabel = meta?.values?.find((v) => v.code === Math.round(param.value))?.label;

  return (
    <div className="flex flex-col gap-0.5 py-1 px-2 text-xs hover:bg-bg-tertiary/50 rounded">
      <div className="flex items-center gap-2">
        <span className="w-40 shrink-0 truncate font-mono text-text-primary sm:w-56" title={param.name}>
          {param.name}
        </span>
        {isEditing ? (
          meta?.values ? (
            <EnumEditor meta={meta} editValue={editValue} onEditChange={onEditChange} onConfirm={onConfirm} onCancel={onCancel} />
          ) : meta?.bitmask ? (
            <BitmaskEditor meta={meta} editValue={editValue} onEditChange={onEditChange} onConfirm={onConfirm} onCancel={onCancel} />
          ) : (
            <TextEditor meta={meta} editValue={editValue} onEditChange={onEditChange} onConfirm={onConfirm} onCancel={onCancel} />
          )
        ) : (
          <button
            onClick={onStartEdit}
            className="w-28 truncate text-left font-mono text-accent-blue hover:underline"
            title={valueLabel ? `${displayValue(param)} (${valueLabel})` : "Click to edit"}
          >
            {valueLabel ?? displayValue(param)}
          </button>
        )}
        {meta?.units ? (
          <span
            className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted"
            title={meta.unitText ?? param.param_type}
          >
            {meta.units}
          </span>
        ) : (
          <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
            {param.param_type}
          </span>
        )}
        {meta?.rebootRequired && (
          <span title="Reboot required after change">
            <RotateCw size={10} className="shrink-0 text-warning" />
          </span>
        )}
      </div>
      {meta?.description && (
        <span className="ml-0.5 truncate text-[11px] text-text-muted" title={meta.description}>
          {meta.humanName && meta.humanName !== meta.description
            ? meta.humanName
            : meta.description}
        </span>
      )}
    </div>
  );
}

function ParamGroup({
  prefix,
  params,
  metadata,
  editingParam,
  editValue,
  onStartEdit,
  onEditChange,
  onConfirm,
  onCancel,
}: {
  prefix: string;
  params: Param[];
  metadata: ParamMetadataMap | null;
  editingParam: string | null;
  editValue: string;
  onStartEdit: (name: string, value: string) => void;
  onEditChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm font-medium text-text-primary hover:bg-bg-tertiary/50"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{prefix}</span>
        <span className="ml-1 text-xs text-text-muted">({params.length})</span>
      </button>
      {expanded && (
        <div className="ml-2 border-l border-border pl-1">
          {params.map((param) => (
            <ParamRow
              key={param.name}
              param={param}
              meta={metadata?.get(param.name)}
              isEditing={editingParam === param.name}
              editValue={editValue}
              onStartEdit={() => onStartEdit(param.name, displayValue(param))}
              onEditChange={onEditChange}
              onConfirm={onConfirm}
              onCancel={onCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ConfigPanel({ params, connected }: ConfigPanelProps) {
  const downloading = params.progress?.phase === "downloading";

  const handleStartEdit = (name: string, value: string) => {
    params.setEditingParam(name);
    params.setEditValue(value);
  };

  const handleConfirm = () => {
    if (!params.editingParam) return;
    const val = Number(params.editValue);
    if (!Number.isFinite(val)) return;
    params.write(params.editingParam, val);
    params.setEditingParam(null);
  };

  const handleCancel = () => {
    params.setEditingParam(null);
  };

  const groupKeys = Object.keys(params.groupedParams).sort();

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={params.download}
          disabled={!connected || downloading}
          className="flex items-center gap-1.5 rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
        >
          <RefreshCw size={12} className={downloading ? "animate-spin" : ""} />
          {downloading ? "Downloading…" : "Refresh"}
        </button>
        <button
          onClick={params.saveToFile}
          disabled={!params.store}
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-opacity disabled:opacity-40"
        >
          <Save size={12} />
          Save
        </button>
        <button
          onClick={params.loadFromFile}
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-opacity disabled:opacity-40"
        >
          <FolderOpen size={12} />
          Load
        </button>
        {params.metadataLoading && (
          <span className="flex items-center gap-1 text-[10px] text-text-muted">
            <Loader2 size={10} className="animate-spin" />
            Loading descriptions…
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Search size={12} className="text-text-muted" />
          <input
            type="text"
            placeholder="Search parameters…"
            value={params.search}
            onChange={(e) => params.setSearch(e.target.value)}
            className="w-full rounded border border-border bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-muted sm:w-48"
          />
        </div>
      </div>

      {/* Progress bar */}
      {downloading && params.progress && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className="h-full rounded-full bg-accent-blue transition-all"
              style={{
                width: params.progress.expected > 0
                  ? `${(params.progress.received / params.progress.expected) * 100}%`
                  : "0%",
              }}
            />
          </div>
          <span className="text-[10px] text-text-muted">
            {params.progress.received} / {params.progress.expected} parameters
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!connected ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Connect to a vehicle to view parameters
          </div>
        ) : !params.store ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Click Refresh to download parameters from the vehicle
          </div>
        ) : params.filteredParams.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            {params.search ? "No parameters match your search" : "No parameters available"}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {groupKeys.map((prefix) => (
              <ParamGroup
                key={prefix}
                prefix={prefix}
                params={params.groupedParams[prefix]}
                metadata={params.metadata}
                editingParam={params.editingParam}
                editValue={params.editValue}
                onStartEdit={handleStartEdit}
                onEditChange={params.setEditValue}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      {params.store && (
        <div className="border-t border-border pt-1.5 text-[10px] text-text-muted">
          {params.filteredParams.length} of {params.paramList.length} parameters
          {params.search && ` matching "${params.search}"`}
          {params.metadata && ` · ${params.metadata.size} descriptions loaded`}
        </div>
      )}
    </div>
  );
}
