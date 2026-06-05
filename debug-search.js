const fetch = global.fetch;
const sheetId = '1hLDE0Hy87ekRhf-1KUhXdrHHdH5LT176BG-0K4yHbaE';
const gids = ['0','1868655219','699711958','1853935368'];
const code = 'SF5193248043815';
(async () => {
  for (const gid of gids) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const res = await fetch(url);
    const txt = await res.text();
    const lines = txt.split('\n');
    const matches = lines.map((line, idx) => ({ line, idx })).filter(x => x.line.includes(code));
    if (matches.length) {
      console.log('GID', gid, 'matches', matches.length);
      matches.forEach(m => console.log('line', m.idx+1, m.line));
    }
  }
})();
