const MAX_PAGES = 200

/**
 * Fetches all rows from a Supabase table using paginated .range() calls.
 *
 * `buildQuery` must return a fresh Supabase query builder without .order()
 * or .range() — the helper adds deterministic ordering (created_at, id)
 * and iterates until a partial page signals the end of data.
 *
 * Throws if Supabase returns an error on any page. Warns and stops if the
 * 200-page safety cap is reached.
 *
 * @param {() => import('@supabase/supabase-js').PostgrestFilterBuilder} buildQuery
 * @param {number} pageSize
 * @returns {Promise<Array>}
 */
export async function fetchAllPages(buildQuery, pageSize = 1000) {
  const allRows = []
  let page = 0

  while (page < MAX_PAGES) {
    const from = page * pageSize
    const to = from + pageSize - 1

    const { data, error } = await buildQuery()
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)

    if (error) throw new Error(`fetchAllPages page ${page}: ${error.message}`)
    if (!data || data.length === 0) break

    allRows.push(...data)

    if (data.length < pageSize) break
    page++
  }

  if (page >= MAX_PAGES) {
    console.warn(
      `[fetchAllPages] Safety cap reached: ${MAX_PAGES} pages × ${pageSize} rows. ` +
        `Result may be incomplete.`
    )
  }

  return allRows
}

/**
 * Splits an array into chunks of at most `size` elements.
 * Use to keep .in() filter lists within the 100-item URL-safe limit.
 *
 * @param {Array} arr
 * @param {number} size
 * @returns {Array[]}
 */
export function chunkArray(arr, size = 100) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}
