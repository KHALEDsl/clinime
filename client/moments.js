/* Decorative Clinime moments. Business state, copy and replay policy belong to the journey. */
(() => {
  'use strict';
  let sequence = 0;
  const key = (id, kind) => `cm-${kind}-${String(id || ++sequence).replace(/[^a-zA-Z0-9_-]/g, '-')}-${++sequence}`;
  const paint = (id) => `<defs>
    <linearGradient id="${id}-blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F9FBFF"/><stop offset=".4" stop-color="#C6DFEF"/><stop offset=".76" stop-color="#78A9CB"/><stop offset="1" stop-color="#4F8DBD"/></linearGradient>
    <linearGradient id="${id}-pink" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFFAFD"/><stop offset=".43" stop-color="#FCE8F0"/><stop offset=".78" stop-color="#F3B6C8"/><stop offset="1" stop-color="#D88DAA"/></linearGradient>
    <linearGradient id="${id}-white" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#FFFFFF"/><stop offset=".5" stop-color="#F9FBFF"/><stop offset="1" stop-color="#DDE7F0"/></linearGradient>
    <linearGradient id="${id}-edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#D6E5F0"/><stop offset="1" stop-color="#AEBFD1"/></linearGradient>
    <linearGradient id="${id}-ink" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#4F8DBD"/><stop offset="1" stop-color="#8AB8D4"/></linearGradient>
    <radialGradient id="${id}-halo"><stop stop-color="#FCE8F0" stop-opacity=".8"/><stop offset=".62" stop-color="#EAF3FC" stop-opacity=".65"/><stop offset="1" stop-color="#F9FBFF" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-glow"><stop stop-color="#FFFFFF" stop-opacity=".95"/><stop offset="1" stop-color="#F3B6C8" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-shadow"><stop stop-color="#6E8CA5" stop-opacity=".2"/><stop offset="1" stop-color="#6E8CA5" stop-opacity="0"/></radialGradient>
  </defs>`;
  const sparkles = (id) => `<g class="cm-sparkles" fill="url(#${id}-blue)">
    <path class="cm-spark cm-spark-a" d="M238 81c1 12 4 15 14 16-10 1-13 4-14 16-1-12-4-15-14-16 10-1 13-4 14-16Z"/>
    <path class="cm-spark cm-spark-b" d="M72 165c1 9 3 11 10 12-7 1-9 3-10 12-1-9-3-11-10-12 7-1 9-3 10-12Z"/>
    <path class="cm-spark cm-spark-c" d="M218 206c.5 7 2 8 7 9-5 1-6.5 2-7 9-.5-7-2-8-7-9 5-1 6.5-2 7-9Z"/>
    <circle cx="91" cy="100" r="1.8" opacity=".55"/><circle cx="253" cy="150" r="1.5" opacity=".5"/>
  </g>`;

  function bloom({ animate = false, id } = {}) {
    const uid = key(id, 'bloom');
    const petal = (index, rotation, color, size) => `<g class="cm-petal cm-petal-${index}" transform="rotate(${rotation} 160 205)"><g transform="translate(160 205) scale(${size}) translate(-160 -205)">
      <path d="M160 205C126 191 119 156 132 126c11-25 24-40 28-58 4 18 17 33 28 58 13 30 6 65-28 79Z" fill="url(#${uid}-${color})" stroke="#FFFFFF" stroke-opacity=".68" stroke-width=".8"/>
      <path d="M160 199c-8-34-8-78 0-121M159 190c-16-21-25-43-25-62" fill="none" stroke="#FFFFFF" stroke-opacity=".68" stroke-width=".8"/>
      <path d="M160 201c20-21 28-45 27-69" fill="none" stroke="#B986A3" stroke-opacity=".14" stroke-width="1"/>
    </g></g>`;
    return `<div class="clinime-moment clinime-moment--bloom${animate ? ' is-blooming' : ''}" aria-hidden="true"><svg class="cm-art" viewBox="0 0 320 300" width="320" height="300" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      ${paint(uid)}<ellipse cx="160" cy="155" rx="152" ry="141" fill="url(#${uid}-halo)"/>
      <g class="cm-flower" opacity="0">
        <ellipse class="cm-flower-shadow" cx="160" cy="256" rx="87" ry="11" fill="url(#${uid}-shadow)"/>
        <path class="cm-stem" d="M160 205c-8 19-11 37-7 56" fill="none" stroke="url(#${uid}-blue)" stroke-width="2.5"/>
        ${petal(1, -92, 'blue', .83)}${petal(2, 92, 'blue', .83)}${petal(3, -64, 'pink', .95)}${petal(4, 64, 'pink', .95)}${petal(5, -37, 'blue', 1)}${petal(6, 37, 'blue', 1)}${petal(7, -18, 'pink', 1.02)}${petal(8, 18, 'pink', 1.02)}${petal(9, 0, 'white', .8)}
        <g class="cm-flower-heart" fill="#D78EA8"><ellipse cx="160" cy="199" rx="14" ry="5" opacity=".4"/><path d="M154 201l-7-24m13 24v-31m6 31 8-24" fill="none" stroke="#E5A5BC" stroke-width="1"/><circle cx="147" cy="177" r="2"/><circle cx="160" cy="170" r="2.4"/><circle cx="174" cy="177" r="2"/></g>
      </g>
      <g class="cm-confirmation">
        <circle cx="160" cy="147" r="65" fill="#F9FBFF" fill-opacity=".68"/>
        <g class="cm-petal-ring" fill="none">
          <circle cx="160" cy="147" r="65" stroke="url(#${uid}-ink)" stroke-width="1.4" opacity=".55"/>
          <path d="M112 103c-21 11-34 35-25 61 2-24 10-36 26-45 14-8 18-14 16-26-3 6-8 8-17 10Z" fill="url(#${uid}-blue)" opacity=".9"/>
          <path d="M208 191c21-11 34-35 25-61-2 24-10 36-26 45-14 8-18 14-16 26 3-6 8-8 17-10Z" fill="url(#${uid}-pink)" opacity=".9"/>
          <path d="M115 194c14 19 41 27 65 13-24 3-37-2-49-16-11-12-17-15-28-10 6 1 9 5 12 13Z" fill="url(#${uid}-pink)" opacity=".75"/>
          <path d="M205 100c-14-19-41-27-65-13 24-3 37 2 49 16 11 12 17 15 28 10-6-1-9-5-12-13Z" fill="url(#${uid}-blue)" opacity=".75"/>
        </g>
        <path class="cm-check" d="m134 147 18 18 36-38" fill="none" stroke="url(#${uid}-ink)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </g>${sparkles(uid)}
    </svg></div>`;
  }

  function gift({ phase = 'closed', id } = {}) {
    const state = ['closed', 'opening', 'revealed'].includes(phase) ? phase : 'closed';
    const uid = key(id, 'gift');
    return `<div class="clinime-moment clinime-moment--gift is-${state}" aria-hidden="true"><svg class="cm-art" viewBox="0 0 320 300" width="320" height="300" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      ${paint(uid)}<defs><clipPath id="${uid}-card-window"><rect width="320" height="239"/></clipPath></defs><ellipse cx="160" cy="163" rx="151" ry="136" fill="url(#${uid}-halo)"/>
      <ellipse class="cm-gift-shadow" cx="160" cy="264" rx="102" ry="16" fill="url(#${uid}-shadow)"/>
      <g class="cm-gift-scene">
        <path d="m91 175 69-23 69 23-69 25Z" fill="#C5D4E1" stroke="#F9FBFF" stroke-width="1"/>
        <path d="m102 175 58-18 58 18-58 20Z" fill="#9CB2C6" opacity=".52"/>
        <ellipse class="cm-gift-light" cx="160" cy="169" rx="90" ry="84" fill="url(#${uid}-glow)"/>
        <g clip-path="url(#${uid}-card-window)"><g class="cm-gift-card" transform="translate(0 0) rotate(-5 160 158)">
          <rect x="110" y="72" width="104" height="130" rx="9" fill="#C6A8B9" opacity=".13" transform="translate(1 4)"/>
          <rect x="108" y="69" width="104" height="130" rx="9" fill="url(#${uid}-white)" stroke="#F3B6C8" stroke-width="1"/>
          <rect x="114" y="75" width="92" height="118" rx="6" fill="none" stroke="#F3B6C8" stroke-opacity=".46" stroke-width=".8"/>
          <path d="M160 146c-6-5-18-13-18-22 0-10 12-14 18-5 6-9 18-5 18 5 0 9-12 17-18 22Z" fill="url(#${uid}-pink)" stroke="#FFFFFF" stroke-opacity=".7" stroke-width=".7"/>
          <path d="M145 159h30m-22 7h14" fill="none" stroke="#BACFDF" stroke-linecap="round" stroke-width="1.5"/>
          <path d="M122 88h7m-7 0v7m76 85h-7m7 0v-7" fill="none" stroke="#E8B9CD" stroke-width=".8"/>
        </g></g>
        <g class="cm-gift-base">
          <path d="m91 175 69 23v68l-69-25Z" fill="url(#${uid}-white)" stroke="#CBD9E5" stroke-width=".8"/>
          <path d="m160 198 69-23v66l-69 25Z" fill="#DDE8F1" stroke="#C1D2E0" stroke-width=".8"/>
          <path d="m91 175 69 23 69-23" fill="none" stroke="#FFFFFF" stroke-width="2"/>
          <path d="m120 185 16 5v67l-16-6Z" fill="url(#${uid}-pink)"/>
          <path d="m186 189 16-5v68l-16 6Z" fill="url(#${uid}-blue)"/>
          <path d="m121 187 2 .6v62m65-59v65" fill="none" stroke="#FFFFFF" stroke-opacity=".7" stroke-width=".9"/>
          <path d="M160 201v62" stroke="#FFFFFF" stroke-opacity=".75" fill="none"/>
        </g>
        <g class="cm-gift-lid" transform="translate(-26 -63) rotate(-25 92 173)">
          <path d="m80 153 80-27 80 27-80 28Z" fill="url(#${uid}-white)" stroke="#D1DFE9" stroke-width=".8"/>
          <path d="m80 153 80 28v23l-80-28Z" fill="url(#${uid}-white)" stroke="#CBD9E5" stroke-width=".8"/>
          <path d="m160 181 80-28v23l-80 28Z" fill="#D3E1EC" stroke="#C1D2E0" stroke-width=".8"/>
          <path d="m80 153 80 28 80-28" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
          <path d="m113 142 17-6 79 28-18 6Z" fill="url(#${uid}-blue)"/>
          <path d="m113 165 18 6v23l-18-6Z" fill="url(#${uid}-pink)"/>
          <path d="m131 171 79-28-17-6-80 28Z" fill="url(#${uid}-pink)"/>
          <path d="m190 170 19-6v23l-19 6Z" fill="url(#${uid}-blue)"/>
          <g class="cm-gift-bow">
            <path d="M158 146c-28 1-57-10-53-26 4-19 31-5 53 26Z" fill="url(#${uid}-blue)" stroke="#F9FBFF" stroke-opacity=".8" stroke-width=".8"/>
            <path d="M153 141c-17-17-31-22-36-17-5 6 13 15 36 17Z" fill="#F9FBFF" opacity=".58"/>
            <path d="M160 145c3-27 24-52 36-39 11 14-5 33-36 39Z" fill="url(#${uid}-pink)" stroke="#F9FBFF" stroke-opacity=".8" stroke-width=".8"/>
            <path d="M166 138c14-9 24-19 23-25-6-4-15 7-23 25Z" fill="#FFFAFD" opacity=".7"/>
            <path d="M160 147c23-12 50-14 52 0 1 12-22 15-52 0Z" fill="url(#${uid}-blue)" stroke="#F9FBFF" stroke-opacity=".7" stroke-width=".8"/>
            <path d="M158 148c-9 9-17 22-19 34l-9-8-10 3c5-15 16-25 38-29Z" fill="url(#${uid}-pink)" stroke="#F9FBFF" stroke-opacity=".5" stroke-width=".7"/>
            <path d="M161 147c13 4 24 12 29 26l7-8 10 1c-9-17-25-24-46-19Z" fill="url(#${uid}-blue)" stroke="#F9FBFF" stroke-opacity=".5" stroke-width=".7"/>
            <rect x="153" y="139" width="15" height="12" rx="4" fill="url(#${uid}-pink)" stroke="#FFFFFF" stroke-opacity=".75" stroke-width=".8" transform="rotate(8 160 145)"/>
          </g>
        </g>
      </g>
      <g class="cm-gift-petals"><path class="cm-gift-petal-a" d="M69 205c-13-14-22-15-28-20 0 18 9 26 28 20Z" fill="url(#${uid}-pink)"/><path class="cm-gift-petal-b" d="M252 116c17-5 23-16 22-29-11 10-23 12-22 29Z" fill="url(#${uid}-pink)"/><path class="cm-gift-petal-c" d="M246 232c12 3 21-2 28-13-14 2-23-2-28 13Z" fill="url(#${uid}-blue)"/></g>
      ${sparkles(uid)}
    </svg></div>`;
  }

  window.ClinimeMoments = Object.freeze({ bloom, gift, durations: Object.freeze({ bloom: 3200, gift: 3000 }) });
})();
