import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Loads all of the current user's rows from a table (RLS filters to her own). */
export function useRows<T>(table: string, orderBy: string) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from(table)
      .select('*')
      .order(orderBy)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        else setRows((data ?? []) as T[]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [table, orderBy]);

  return { rows, setRows, loading, error };
}
