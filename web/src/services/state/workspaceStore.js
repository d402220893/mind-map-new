// L2 状态层：只持内存状态，不做 IO、不碰 localStorage（§16.1）。
export function createWorkspaceStore(initial = {}) {
  let state = { root: '', tree: [], indexCache: null, watcher: null, ...initial }
  return {
    get: () => state,
    setRoot: (root) => { state = { ...state, root } },
    setTree: (tree) => { state = { ...state, tree } },
    setIndexCache: (indexCache) => { state = { ...state, indexCache } },
    reset: () => { state = { root: '', tree: [], indexCache: null, watcher: null } }
  }
}
