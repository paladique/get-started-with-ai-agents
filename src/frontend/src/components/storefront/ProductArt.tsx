export function ProductArt({ kind, id = 1 }: { kind: string; id?: number }) {
  const colors = ['#788a6a', '#c18b57', '#657d83', '#bd674a', '#9b995c'];
  const color = colors[id % colors.length];
  return <svg viewBox="0 0 300 240" aria-hidden="true" className="product-art">
    <ellipse cx="150" cy="207" rx="84" ry="9" fill="#233f32" opacity=".07" />
    <g stroke="#263e34" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
      {kind === 'tent' && <><path d="M38 192 145 55l118 137Z" fill={color}/><path d="m145 55 27 137h91Z" fill="#e3c08c"/><path d="m145 82-65 110h91Z" fill="#344d40"/><path d="m145 82 5 110h21Z" fill="#f5dfb3"/><path d="M38 192h225M145 55v-9M42 185l-16 17m228-17 20 17"/><path d="m73 176 55-83" stroke="#fff" opacity=".3"/></>}
      {kind === 'pack' && <><path d="M132 58v-9q18-14 36 0v10" fill="none"/><path d="M98 76q-21 33-11 111m115-111q20 35 11 111" fill="none" strokeWidth="9" stroke="#b4b6a3"/><rect x="99" y="58" width="103" height="143" rx="31" fill={color}/><path d="M97 80q53 24 106 0v-4q0-24-25-24h-55q-25 0-26 24Z" fill={color}/><rect x="115" y="131" width="71" height="56" rx="12" fill="#ffffff" fillOpacity=".14"/><path d="M118 148h66M130 79v38m42-38v38"/><rect x="124" y="102" width="12" height="15" rx="2" fill="#e3c08c"/><rect x="166" y="102" width="12" height="15" rx="2" fill="#e3c08c"/><path d="m143 68 7-9 7 9" fill="none" stroke="#f5e6c9"/></>}
      {kind === 'jacket' && <><path d="m115 63 19-11h32l20 11 39 72-30 16-13-26 4 75h-73l4-75-14 26-29-16Z" fill={color}/><path d="M134 52q16 43 32 0l-16 28Z" fill="#e5dbc4"/><path d="M150 80v120m-27-45-7 16m61-16 7 16m-77-29-22-12m112 12 21-12"/><path d="m170 106 9-7" stroke="#eadfc8"/></>}
      {(kind === 'boots' || kind === 'sandals') && <><path d="m87 80 55-8 13 66 54 18q27 6 28 29l-8 13H74q-6-29 3-49Z" fill={color}/><path d="m82 194 150-2v13H77Z" fill="#e1c99e"/><path d="m91 80 15 69 43-8m-39-39 35-6m-33 19 36-7m-33 19 37-7" fill="none" stroke="#ead9b7" strokeWidth="5"/><path d="M167 148v35m-72 22v-6m22 6v-6m22 6v-6m22 6v-6m22 6v-6m22 6v-6"/>{kind==='sandals' && <path d="m94 142 36 37m15-41-18 42m48-31-17 33" stroke="#e5d6ba" strokeWidth="13"/>}</>}
      {kind === 'pants' && <><path d="M107 48h86l-6 62 10 93h-40l-8-99-9 99H99l9-93Z" fill={color}/><path d="M107 61h85m-43 0v43m-41-24 22-9m59 9-20-9m-62 64h28m26 0h28" fill="none"/><path d="M101 191h39m16 0h39" stroke="#e1d0a9"/></>}
      {kind === 'sleeping' && <><path d="M113 66q0-34 37-34t37 34l12 110q3 30-27 31h-44q-30-1-27-31Z" fill={color}/><ellipse cx="150" cy="66" rx="24" ry="20" fill="#ded3b6"/><path d="M113 102h74m-77 23h80m-82 24h84m-85 24h87m-71 23h57M174 91v106" fill="none" strokeOpacity=".55"/></>}
      {kind === 'stove' && <><path d="M95 148h110l-11 49H107Z" fill={color}/><path d="M118 145v-19h64v19" fill="#d2d4c7"/><ellipse cx="150" cy="125" rx="37" ry="9" fill="#d8d5bd"/><path d="m115 125-16-22m86 22 16-22m-51 12V96m-43 97-8 12m94-12 8 12" fill="none" strokeWidth="6"/><path d="M142 107q-19-18 10-47-5 23 9 30 10 14-5 22" fill="#dba664" stroke="none"/><circle cx="177" cy="172" r="8" fill="#e4d3ac"/><path d="M120 163h26m-24 8h22"/></>}
      {kind === 'table' && <><path d="m73 111 154-10 23 30-163 13Z" fill="#c9b492"/><path d="m88 143 8 62m139-71-10 71m-4-61-116 55m-6-50 120 51" fill="none" stroke="#667267" strokeWidth="6"/><path d="m92 119 135-8m-127 16 134-8" stroke="#8f7c5f"/></>}
      {kind === 'chair' && <><path d="m104 64 91 6-10 74-72-1Z" fill={color}/><path d="m112 142-18 26 105 3-15-27Z" fill={color}/><path d="m109 155-21 50m104-50 22 50m-115-6 101-38m-94 2 100 37m-96-52-20-32m96 34 20-31" fill="none" strokeWidth="5"/><path d="M82 116h29m77 3h28" strokeWidth="7"/><path d="M128 86h42" stroke="#e8dcc0"/></>}
      {kind === 'glasses' && <><path d="m69 118-17-30h47m129 30 18-30h-47" fill="none" strokeWidth="9"/><path d="M66 110h68v40q-33 22-57 0Zm100 0h68l-11 40q-24 22-57 0Z" fill="#809c91" strokeWidth="7"/><path d="M134 121q16-14 32 0" fill="none" strokeWidth="7"/><path d="m85 123 18 25m80-25 18 25" stroke="#d2e4d7" opacity=".7"/></>}
      {kind === 'blanket' && <><path d="m75 70 129 6 21 113-133 12Z" fill={color}/><path d="m75 70 17 131 21-18-8-114" fill="#c6b49a"/><path d="m109 104 98 4m-94 22 99 4m-95 22 99 4m-94 22 98 4M128 77l17 116m12-114 19 111m10-109 17 106" stroke="#e4d6b9" strokeWidth="3"/><path d="m98 202 1 9m12-10 1 9m12-10 1 9m12-10 1 9m12-10 1 9m12-10 1 9m12-10 1 9m12-10 1 9m12-10 1 9"/></>}
    </g>
  </svg>;
}

export function Landscape() {
 return <svg viewBox="0 0 660 410" role="img" aria-label="An illustrated campsite among mountains and pine trees" className="landscape">
  <defs><linearGradient id="sky" x2="0" y2="1"><stop stopColor="#d8dcca"/><stop offset="1" stopColor="#f3e8ce"/></linearGradient></defs>
  <path fill="url(#sky)" d="M0 0h660v410H0z"/><circle cx="454" cy="92" r="48" fill="#eab477"/>
  <path d="m0 244 128-153 79 103L328 52l185 202 97-125 50 87v194H0Z" fill="#abb9a4"/>
  <path d="m328 52-49 110 41-21 28 34 9-44 38-5Z" fill="#f4f0df"/><path d="m128 91-32 57 25-10 16 17 18-22Z" fill="#eff0dd"/>
  <path d="m0 280 116-76 98 80 173-111 128 85 145-55v207H0Z" fill="#708f7c"/>
  <path d="M0 336q166-78 314-26t346-44v144H0Z" fill="#3c6351"/>
  <path d="M330 410q-88-60 46-96 40-11 18-25 43 16-1 34-91 40 32 87" fill="#afba9a"/>
  {[40,79,108,537,580,626].map((x,i)=><g key={x} transform={`translate(${x} ${i<3?228:210}) scale(${i%2?1.15:.85})`} fill="#234b3b"><path d="m0 0-28 49h14l-27 35h25l-29 40h90L16 84h25L14 49h14Z"/><path d="M-4 114h8v40h-8z"/></g>)}
  <path d="m109 361 83-95 87 95Z" fill="#c98b53"/><path d="m192 266 20 95h67Z" fill="#e1af73"/><path d="m192 289-47 72h66Z" fill="#344e3d"/><path d="m192 289 6 72h13Z" fill="#eed1a1"/><path d="M95 363h198" stroke="#b9c1a0" strokeWidth="2"/>
  <g fill="#e9e3c8"><path d="M49 67q13-9 26 0-13-4-26 0m38-13q10-8 20 0-10-4-20 0"/></g>
 </svg>;
}
