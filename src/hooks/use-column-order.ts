import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ReorderableColumn<Key extends string> = {
  key: Key;
  label: string;
};

function reconcileColumnKeys<Key extends string>(columns: ReorderableColumn<Key>[], savedKeys: string[]) {
  const validKeys = new Set(columns.map((column) => column.key));
  const orderedKeys = savedKeys.filter((key): key is Key => validKeys.has(key as Key));
  const missingKeys = columns.map((column) => column.key).filter((key) => !orderedKeys.includes(key));
  return [...orderedKeys, ...missingKeys];
}

function areKeysEqual<Key extends string>(left: Key[], right: Key[]) {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

export function useColumnOrder<Key extends string>(storageKey: string, columns: ReorderableColumn<Key>[]) {
  const draggedColumnRef = useRef<Key | null>(null);
  const suppressClickRef = useRef(false);
  const [orderedKeys, setOrderedKeys] = useState<Key[]>(() => {
    if (typeof window === "undefined") return columns.map((column) => column.key);

    try {
      const savedKeys = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
      return reconcileColumnKeys(columns, Array.isArray(savedKeys) ? savedKeys : []);
    } catch {
      return columns.map((column) => column.key);
    }
  });

  useEffect(() => {
    setOrderedKeys((currentKeys) => {
      const nextKeys = reconcileColumnKeys(columns, currentKeys);
      return areKeysEqual(currentKeys, nextKeys) ? currentKeys : nextKeys;
    });
  }, [columns]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(orderedKeys));
  }, [orderedKeys, storageKey]);

  const orderedColumns = useMemo(() => {
    const columnMap = new Map(columns.map((column) => [column.key, column]));
    return orderedKeys.flatMap((key) => {
      const column = columnMap.get(key);
      return column ? [column] : [];
    });
  }, [columns, orderedKeys]);

  const moveColumn = useCallback((targetKey: Key) => {
    const draggedKey = draggedColumnRef.current;
    if (!draggedKey || draggedKey === targetKey) return;

    setOrderedKeys((currentKeys) => {
      const nextKeys = currentKeys.filter((key) => key !== draggedKey);
      const targetIndex = nextKeys.indexOf(targetKey);
      if (targetIndex === -1) return currentKeys;
      nextKeys.splice(targetIndex, 0, draggedKey);
      return nextKeys;
    });
    suppressClickRef.current = true;
  }, []);

  const getColumnDragProps = useCallback(
    (key: Key) => ({
      draggable: true,
      onDragStart: (event: DragEvent) => {
        draggedColumnRef.current = key;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", key);
      },
      onDragOver: (event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        moveColumn(key);
      },
      onDragEnd: () => {
        draggedColumnRef.current = null;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      },
    }),
    [moveColumn],
  );

  const shouldSuppressColumnClick = useCallback(() => suppressClickRef.current, []);

  return {
    orderedColumns,
    getColumnDragProps,
    shouldSuppressColumnClick,
  };
}
