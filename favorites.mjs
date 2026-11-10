import { esc, countFesStudents } from './core.mjs?v=9';

export const FAVORITES_KEY = 'resetfactory.favoriteAccounts.v1';
export const MAX_FAVORITES = 20;

const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
const cleanIds = ids => [...new Set(Array.isArray(ids) ? ids.filter(validId) : [])].slice(0, MAX_FAVORITES);

export function readFavoriteIds(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(FAVORITES_KEY) ?? 'null');
    return saved?.version === 1 ? cleanIds(saved.ids) : [];
  } catch { return []; }
}

export function writeFavoriteIds(ids, storage) {
  try {
    if (!storage) return false;
    storage.setItem(FAVORITES_KEY, JSON.stringify({ version: 1, ids: cleanIds(ids) }));
    return true;
  } catch { return false; }
}

export function toggleFavorite(ids, id) {
  const current = cleanIds(ids);
  if (!validId(id)) return { ids: current, added: false, full: false };
  if (current.includes(id)) return { ids: current.filter(value => value !== id), added: false, full: false };
  if (current.length >= MAX_FAVORITES) return { ids: current, added: false, full: true };
  return { ids: [...current, id], added: true, full: false };
}

export function toggleCompareSelection(ids, id, availableIds) {
  const current = [...new Set(ids)].filter(value => availableIds.has(value)).slice(0, 2);
  if (current.includes(id)) return { ids: current.filter(value => value !== id), full: false };
  if (!availableIds.has(id)) return { ids: current, full: false };
  if (current.length === 2) return { ids: current, full: true };
  return { ids: [...current, id], full: false };
}

export function compareRosters(accounts, students, differencesOnly = true) {
  const known = new Map(students.map(student => [student.id, student]));
  const rosters = accounts.map(account => new Set(account.studentIds.filter(id => known.has(id))));
  const common = rosters.length === 2 ? [...rosters[0]].filter(id => rosters[1].has(id)) : [];
  const shared = new Set(common);
  const weight = student => Math.max(0, (student.present ?? 0) - (student.absent ?? 0));
  const grade = student => student.grade === 'FES' ? 0 : student.grade === '한정' ? 1 : 2;
  return {
    commonCount: common.length,
    students: rosters.map(roster => [...roster]
      .filter(id => !differencesOnly || !shared.has(id)).map(id => known.get(id))
      .sort((a, b) => grade(a) - grade(b) || weight(b) - weight(a) || a.name.localeCompare(b.name, 'ko'))),
  };
}

export function createFavorites({ getCatalog, toast, consultLink = () => '' }) {
  let storage;
  let ids = [];
  let selected = [];
  let initialized = false;
  let dialog;
  let view = 'list';
  let differencesOnly = true;
  let savedLocally = true;
  let storageWarningShown = false;
  let opener;
  let listScroll = 0;
  const money = price => `${Math.round(price * 10000).toLocaleString('ko-KR')}원`;
  const available = () => new Map((getCatalog()?.accounts ?? []).filter(account => account.status !== 'sold').map(account => [account.num, account]));
  const students = () => getCatalog()?.students ?? [];

  function cardButton(account) {
    const saved = ids.includes(account.num);
    return `<button type="button" class="favorite-toggle${saved ? ' is-saved' : ''}" data-toggle-favorite="${esc(account.num)}" aria-pressed="${saved}" aria-label="${esc(account.num)} 관심 계정 ${saved ? '해제' : '담기'}">${saved ? '♥ 담음' : '♡ 담기'}</button>`;
  }

  function refreshButtons() {
    document.querySelectorAll('[data-open-favorites]').forEach(button => {
      button.querySelectorAll('[data-favorites-count]').forEach(count => { count.textContent = ids.length; });
      button.setAttribute('aria-label', `관심 계정 ${ids.length}개 열기`);
    });
    document.querySelectorAll('[data-toggle-favorite]').forEach(button => {
      const saved = ids.includes(button.dataset.toggleFavorite);
      button.classList.toggle('is-saved', saved);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', `${button.dataset.toggleFavorite} 관심 계정 ${saved ? '해제' : '담기'}`);
      button.textContent = saved ? '♥ 담음' : '♡ 담기';
    });
  }

  function persist() {
    savedLocally = writeFavoriteIds(ids, storage);
    if (!savedLocally && !storageWarningShown) {
      storageWarningShown = true;
      toast('브라우저 저장이 제한되어 관심 계정은 현재 창에서만 유지됩니다.');
    }
    refreshButtons();
  }

  function portrait(student) {
    const grade = student.grade === 'FES' ? 'fes' : student.grade === '한정' ? 'limited' : 'regular';
    const title = `${student.fullName || student.name} · ${grade === 'fes' ? '페스' : grade === 'limited' ? '한정' : '통상'}`;
    return `<li class="favorites-student" title="${esc(title)}"><span class="favorites-portrait ${grade}">${student.image
      ? `<img src="${esc(student.image)}" alt="" loading="lazy" width="52" height="52">`
      : `<span class="favorites-fallback">${esc(student.name.slice(0, 1))}</span>`}</span><span class="favorites-student-name">${esc(student.name)}</span></li>`;
  }

  function actions(account) {
    return `<div class="favorites-actions"><button type="button" data-copy="${esc(account.num)}">번호·가격 복사</button>${consultLink(account)}</div>`;
  }

  function savedCard(id, catalog) {
    const account = catalog.get(id);
    if (!account) return `<article class="favorites-saved-card unavailable"><div class="favorites-card-heading"><strong>${esc(id)}</strong><button type="button" data-remove-favorite="${esc(id)}" aria-label="${esc(id)} 관심 계정에서 삭제">삭제</button></div><p>현재 판매 목록에 없음</p></article>`;
    const roster = compareRosters([account], students(), false).students[0];
    return `<article class="favorites-saved-card"><div class="favorites-card-heading"><div><strong>${esc(id)}</strong><span class="favorites-price">${money(account.price)}</span></div><button type="button" data-remove-favorite="${esc(id)}" aria-label="${esc(id)} 관심 계정에서 삭제">삭제</button></div>
      <div class="favorites-card-meta"><span>페스 <b>${countFesStudents(account.studentIds, students())}명</b> · 전체 ${new Set(account.studentIds).size}명</span><label><input type="checkbox" data-compare-account="${esc(id)}" ${selected.includes(id) ? 'checked' : ''}>비교 선택</label></div>
      <ul class="favorites-roster">${roster.slice(0, 6).map(portrait).join('')}</ul>
      ${roster.length > 6 ? `<details class="favorites-more"><summary>전체 학생 보기 (${roster.length}명)</summary><ul class="favorites-roster">${roster.slice(6).map(portrait).join('')}</ul></details>` : ''}
      ${actions(account)}</article>`;
  }

  function renderList(catalog) {
    return `<div class="favorites-content"><p class="favorites-note">검색 조건을 바꿔도 남아 있어요. 이 브라우저에 최대 ${MAX_FAVORITES}개까지 보관합니다.</p>
      ${!savedLocally ? '<p class="favorites-storage-note" role="status">현재 브라우저에서 저장이 제한되어 이 창을 닫으면 담은 목록이 사라질 수 있습니다.</p>' : ''}
      <div class="favorites-list">${ids.length ? ids.map(id => savedCard(id, catalog)).join('') : '<div class="favorites-empty"><strong>마음에 드는 계정을 담아보세요.</strong><p>계정 카드의 ♡ 담기를 누르면 여기에 모입니다.</p><button type="button" data-favorites-close>계정 둘러보기</button></div>'}</div></div>
      ${ids.length ? `<div class="favorites-list-footer"><div><strong>${selected.length}개 비교 선택</strong><small>담아둔 계정 중 2개를 골라주세요.</small></div><button type="button" class="favorites-primary" data-favorites-compare ${selected.length === 2 ? '' : 'disabled'}>두 계정 비교 →</button></div>` : ''}`;
  }

  function renderComparison(catalog) {
    const accounts = selected.map(id => catalog.get(id));
    const comparison = compareRosters(accounts, students(), differencesOnly);
    return `<div class="favorites-content"><div class="favorites-compare-summary">${accounts.map(account => `<section><strong class="favorites-compare-num">${esc(account.num)}</strong><span class="favorites-price">${money(account.price)}</span><p>페스 <b>${countFesStudents(account.studentIds, students())}명</b> · 전체 ${new Set(account.studentIds).size}명</p></section>`).join('')}</div>
      <p class="favorites-price-gap">두 계정의 가격 차이 <strong>${money(Math.abs(accounts[0].price - accounts[1].price))}</strong></p>
      <label class="favorites-diff-toggle"><input type="checkbox" data-favorites-differences ${differencesOnly ? 'checked' : ''}>다른 학생만 보기</label>
      <p class="favorites-note">${differencesOnly ? `공통 학생 ${comparison.commonCount}명은 숨겨 두었어요.` : `공통 학생 ${comparison.commonCount}명을 포함한 전체 구성입니다.`}</p>
      <div class="favorites-compare-rosters">${accounts.map((account, index) => {
        const roster = comparison.students[index];
        return `<section><h3>${differencesOnly ? '이 계정에만' : '보유 학생'} ${roster.length}명</h3><ul class="favorites-roster">${roster.slice(0, 12).map(portrait).join('')}</ul>
          ${!roster.length ? '<p class="favorites-note">이 계정에만 있는 학생이 없습니다.</p>' : ''}
          ${roster.length > 12 ? `<details class="favorites-more"><summary>나머지 ${roster.length - 12}명 보기</summary><ul class="favorites-roster">${roster.slice(12).map(portrait).join('')}</ul></details>` : ''}
          ${actions(account)}</section>`;
      }).join('')}</div><p class="favorites-note favorites-grade-note"><span class="fes">페스</span><span class="limited">한정</span><span class="regular">통상</span></p></div>`;
  }

  function render() {
    const catalog = available();
    selected = selected.filter(id => ids.includes(id) && catalog.has(id));
    if (selected.length !== 2) view = 'list';
    dialog.innerHTML = `<div class="favorites-dialog-top"><div>${view === 'compare' ? '<button class="favorites-back" type="button" data-favorites-back>‹ 담은 목록</button>' : ''}<h2 id="favorites-title">${view === 'compare' ? '계정 비교' : `관심 계정 ${ids.length}개`}</h2></div><button type="button" class="favorites-close" data-favorites-close aria-label="관심 계정 닫기">닫기 ×</button><p class="favorites-feedback" data-favorites-feedback role="status" aria-live="polite"></p></div>${view === 'compare' ? renderComparison(catalog) : renderList(catalog)}`;
  }

  function close() {
    dialog.close();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }

  function open(trigger) {
    if (!initialized) init();
    opener = trigger instanceof HTMLElement ? trigger : document.activeElement;
    view = 'list';
    render();
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = listScroll;
  }

  function init() {
    if (initialized) { refreshButtons(); return; }
    initialized = true;
    try { storage = window.localStorage; } catch { storage = undefined; }
    ids = readFavoriteIds(storage);
    dialog = document.createElement('dialog');
    dialog.className = 'favorites-dialog';
    dialog.setAttribute('aria-labelledby', 'favorites-title');
    document.body.append(dialog);
    document.addEventListener('click', event => {
      const toggle = event.target.closest('button[data-toggle-favorite]');
      if (toggle) {
        const id = toggle.dataset.toggleFavorite;
        if (!available().has(id) && !ids.includes(id)) return;
        const result = toggleFavorite(ids, id);
        if (result.full) { toast(`관심 계정은 ${MAX_FAVORITES}개까지 담을 수 있어요. 담은 목록에서 일부를 삭제해 주세요.`); return; }
        ids = result.ids;
        selected = selected.filter(value => ids.includes(value));
        persist();
        if (savedLocally) toast(result.added ? '관심 계정에 담았습니다. 위쪽 관심 계정에서 확인하세요.' : '관심 계정에서 삭제했습니다.');
        return;
      }
      const trigger = event.target.closest('[data-open-favorites]');
      if (trigger) open(trigger);
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) {
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
        return;
      }
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-favorites-close')) { listScroll = view === 'list' ? dialog.scrollTop : listScroll; close(); }
      if (button.hasAttribute('data-remove-favorite')) {
        const scroll = dialog.scrollTop;
        ids = ids.filter(id => id !== button.dataset.removeFavorite);
        selected = selected.filter(id => ids.includes(id));
        persist(); render(); dialog.scrollTop = scroll;
      }
      if (button.hasAttribute('data-favorites-compare') && selected.length === 2) {
        listScroll = dialog.scrollTop; view = 'compare'; render(); dialog.scrollTop = 0;
        dialog.querySelector('[data-favorites-back]').focus({ preventScroll: true });
      }
      if (button.hasAttribute('data-favorites-back')) {
        view = 'list'; render(); dialog.scrollTop = listScroll;
        dialog.querySelector('[data-favorites-compare]')?.focus({ preventScroll: true });
      }
    });
    dialog.addEventListener('change', event => {
      if (event.target.hasAttribute('data-compare-account')) {
        const input = event.target;
        const result = toggleCompareSelection(selected, input.dataset.compareAccount, new Set(available().keys()));
        if (result.full) {
          input.checked = false;
          const footer = dialog.querySelector('.favorites-list-footer small');
          footer.textContent = '비교는 2개까지 가능합니다. 먼저 하나를 해제해 주세요.';
          footer.setAttribute('role', 'status');
          return;
        }
        selected = result.ids;
        const footer = dialog.querySelector('.favorites-list-footer');
        footer.querySelector('strong').textContent = `${selected.length}개 비교 선택`;
        footer.querySelector('small').textContent = '담아둔 계정 중 2개를 골라주세요.';
        footer.querySelector('button').disabled = selected.length !== 2;
      }
      if (event.target.hasAttribute('data-favorites-differences')) {
        differencesOnly = event.target.checked;
        const scroll = dialog.scrollTop;
        render(); dialog.scrollTop = scroll;
        dialog.querySelector('[data-favorites-differences]').focus({ preventScroll: true });
      }
    });
    dialog.addEventListener('cancel', () => { listScroll = view === 'list' ? dialog.scrollTop : listScroll; });
    window.addEventListener('storage', event => {
      if (event.key !== FAVORITES_KEY && event.key !== null) return;
      ids = readFavoriteIds(storage);
      refreshButtons();
      if (dialog.open) render();
    });
    refreshButtons();
  }

  return { init, cardButton, refreshButtons, open };
}
