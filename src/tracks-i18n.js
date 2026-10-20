// The tracks page's own wording in English and Chinese. English text is the key, so a string
// with no Chinese entry still reads in English rather than as a key. `{name}` slots are filled
// from the values passed in; English plurals are picked by the caller, Chinese has none.
const ZH = {
  // types and kinds
  Flight: '飞行', Drone: '航拍', Drive: '自驾', Ship: '乘船', Hike: '徒步', Run: '跑步', Bike: '骑行', Other: '其他',
  Recorded: '记录', Planned: '计划', Waypoints: '航点',
  undated: '无日期', China: '中国', Australia: '澳大利亚',
  '{month} {year}': '{year} {month}',
  'Previous photo': '上一张', 'Next photo': '下一张', 'Close photos': '关闭照片',
  // filters
  'reset all filters': '重置所有筛选',
  'only tracks inside the current map view': '只显示当前地图范围内的轨迹',
  '◎ in view': '◎ 视野内',
  'more filters': '更多筛选',
  date: '日期', 'from date': '开始日期', 'to date': '结束日期',
  km: '公里', min: '最小', max: '最大', 'alt ≥ m': '海拔 ≥ 米', any: '不限',
  // list
  'take off the map': '从地图移除', 'add to the map': '添加到地图',
  'take {name} off the map': '从地图移除 {name}', 'add {name} to the map': '把 {name} 添加到地图',
  featured: '精选', place: '地点', '{n} pts': '{n} 个点',
  'Untitled track': '未命名轨迹',
  '{n} track': '{n} 条轨迹', '{n} tracks': '{n} 条轨迹',
  '{n} wpt': '{n} 个航点', '{n} wpts': '{n} 个航点',
  'take the file off the map': '从地图移除整个文件', 'add the whole file to the map': '把整个文件添加到地图',
  'take all {n} items of {name} off the map': '从地图移除 {name} 的全部 {n} 项',
  'add all {n} items of {name} to the map': '把 {name} 的全部 {n} 项添加到地图',
  'draw the whole file and zoom to it': '显示整个文件并缩放过去',
  'hide what is in {name}': '收起 {name} 的内容', 'show what is in {name}': '展开 {name} 的内容',
  'hide the items in this file': '收起这个文件的内容', 'show the items in this file': '展开这个文件的内容',
  'no tracks match': '没有符合条件的轨迹',
  'add {n} more tracks from {year} to the map': '再把 {year} 的 {n} 条轨迹添加到地图',
  'take {year} off the map': '从地图移除 {year}', 'add {year} to the map': '把 {year} 添加到地图',
  '{n} file': '{n} 个文件', '{n} files': '{n} 个文件',
  'take these tracks off the map': '从地图移除这些轨迹', 'add these tracks to the map': '把这些轨迹添加到地图',
  'take all {n} listed tracks off the map': '从地图移除列出的全部 {n} 条轨迹',
  'add all {n} listed tracks to the map': '把列出的全部 {n} 条轨迹添加到地图',
  'remove all {n}': '全部移除 {n}', 'add {max} of {n}': '添加 {max}/{n}', 'add all {n}': '全部添加 {n}',
  '{year} · all months': '{year} · 全部月份',
  // detail
  'elevation profile': '海拔剖面',
  points: '点数', 'min ele': '最低海拔', 'max ele': '最高海拔', distance: '距离', duration: '用时',
  'max speed': '最高速度', 'avg speed': '平均速度', ascent: '累计爬升',
  Place: '地点', '× off map': '× 移出地图', '+ on map': '+ 加到地图', close: '关闭',
  '▾ less': '▾ 收起', '▸ more': '▸ 更多', pause: '暂停', play: '播放',
  'playback speed': '播放速度', '■ stopped {d}': '■ 停留 {d}', 'playback position': '播放位置',
  // panel
  '● places {n}': '● 地点 {n}', '✦ map {n}': '✦ 地图 {n}',
  'take every track off the map': '从地图移除所有轨迹', clear: '清空', filter: '筛选',
  'nothing on the map yet': '地图上还没有内容',
  '★ add {n} featured': '★ 添加 {n} 条精选', 'add {year} · {n}': '添加 {year} · {n}',
  'browse tracks': '浏览轨迹', library: '轨迹库', projects: '项目', places: '地点',
  'search track name…': '搜索轨迹名称…', 'search tracks': '搜索轨迹',
  // projects and places
  '‹ all projects': '‹ 全部项目', 'curated project': '精选项目', '{n} item': '{n} 项', '{n} items': '{n} 项',
  'project layers': '项目图层', tracks: '轨迹', waypoints: '航点', 'project days': '项目日期',
  'all days': '全部', '{n} item shown': '显示 {n} 项', '{n} items shown': '显示 {n} 项',
  'no items for this day and layer selection': '这一天在所选图层下没有内容',
  'no projects published yet': '还没有发布项目', '{n} place': '{n} 个地点', '{n} places': '{n} 个地点',
  // page
  'Track index not found. Add files to data/tracks/ and rebuild.': '找不到轨迹索引。把文件放进 data/tracks/ 后重新构建。',
  '{a} / {b} on map': '地图上 {a} / {b}', loading: '加载中',
  '▴ full · ▾ hide': '▴ 全屏 · ▾ 隐藏', '▾ swipe down': '▾ 下滑收起',
  '{n} track in this link is no longer in the library · dismiss': '链接里有 {n} 条轨迹已不在库中 · 关闭',
  '{n} tracks in this link are no longer in the library · dismiss': '链接里有 {n} 条轨迹已不在库中 · 关闭',
  'done · {n} tracks': '完成 · {n} 条轨迹',
  '◂ panel': '◂ 面板', '▸ panel': '▸ 面板',
  'copy a link to exactly this view': '复制当前视图的链接',
  '✓ copied': '✓ 已复制', '✗ copy it from the address bar': '✗ 请从地址栏复制', '⧉ link': '⧉ 链接',
  'zoom to fit every track on the map': '缩放到地图上的全部轨迹', '⤢ fit': '⤢ 全览',
  'switch basemap': '切换底图', 'switch language': '切换语言',
};

const LANG_KEY = 'tracks:lang';
let current = 'en';

// With no `lang` in the URL: the visitor's own last choice, then the browser's language.
export function readLang() {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch { /* private mode */ }
  return /^zh\b/i.test(navigator.language) ? 'zh' : 'en';
}
export function storeLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* private mode */ }
}
export function setLang(lang) { current = lang; }
export const LOCALE = () => (current === 'zh' ? 'zh-CN' : 'en');

export function t(text, vars) {
  const s = (current === 'zh' && ZH[text]) || text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
