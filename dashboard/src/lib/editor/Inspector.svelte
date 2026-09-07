<script lang="ts">
	import { editor } from './store.svelte';
	import {
		FONT_CHOICES,
		DITHER_LABELS,
		type DitherMode,
		type TextLayer,
		type ImageLayer,
		type ShapeLayer
	} from './types';

	const l = $derived(editor.selected);
	const ditherModes: DitherMode[] = ['threshold', 'bayer2', 'bayer4', 'bayer8', 'floyd'];

	const save = () => editor.persist();
	function textChanged() {
		if (l && l.type === 'text') editor.syncTextSize(l as TextLayer);
		editor.persist();
	}
</script>

<div class="insp">
	<!-- GLOBAL / OUTPUT -->
	<section>
		<span class="eyebrow">Output · dithering</span>
		<div class="field">
			<label for="gmode">Global mode</label>
			<select
				id="gmode"
				bind:value={editor.project.global.mode}
				onchange={save}
			>
				{#each ditherModes as m (m)}
					<option value={m}>{DITHER_LABELS[m]}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="gth">Threshold <b>{editor.project.global.threshold}</b></label>
			<input
				id="gth"
				type="range"
				min="0"
				max="255"
				bind:value={editor.project.global.threshold}
				oninput={save}
			/>
		</div>
		<div class="row2">
			<label class="chk"
				><input
					type="checkbox"
					bind:checked={editor.project.global.invert}
					onchange={save}
				/> Invert</label
			>
			<div class="field inline">
				<label for="bg">BG</label>
				<select id="bg" bind:value={editor.project.background} onchange={save}>
					<option value="white">White</option>
					<option value="black">Black</option>
				</select>
			</div>
		</div>
	</section>

	{#if !l}
		<div class="none">Select a layer to edit its properties.</div>
	{:else}
		<!-- IDENTITY -->
		<section>
			<div class="field">
				<label for="nm">Layer name</label>
				<input id="nm" type="text" bind:value={l.name} oninput={save} />
			</div>
			<div class="row2">
				<label class="chk"
					><input type="checkbox" bind:checked={l.visible} onchange={save} /> Visible</label
				>
				<label class="chk"
					><input type="checkbox" bind:checked={l.locked} onchange={save} /> Lock</label
				>
			</div>
		</section>

		<!-- TRANSFORM -->
		<section>
			<span class="eyebrow">Transform</span>
			<div class="grid4">
				<div class="field">
					<label for="lx">X</label>
					<input id="lx" type="number" bind:value={l.x} oninput={save} />
				</div>
				<div class="field">
					<label for="ly">Y</label>
					<input id="ly" type="number" bind:value={l.y} oninput={save} />
				</div>
				<div class="field">
					<label for="lw">W</label>
					<input
						id="lw"
						type="number"
						min="2"
						bind:value={l.width}
						oninput={save}
						disabled={l.type === 'text'}
					/>
				</div>
				<div class="field">
					<label for="lh">H</label>
					<input
						id="lh"
						type="number"
						min="2"
						bind:value={l.height}
						oninput={save}
						disabled={l.type === 'text'}
					/>
				</div>
			</div>
			<div class="field">
				<label for="rot">Rotation <b>{l.rotation}°</b></label>
				<input id="rot" type="range" min="-180" max="180" bind:value={l.rotation} oninput={save} />
			</div>
			<div class="field">
				<label for="op">Opacity <b>{Math.round(l.opacity * 100)}%</b></label>
				<input id="op" type="range" min="0" max="1" step="0.01" bind:value={l.opacity} oninput={save} />
			</div>
		</section>

		<!-- TYPE SPECIFIC -->
		{#if l.type === 'text'}
			{@const t = l as TextLayer}
			<section>
				<span class="eyebrow">Text</span>
				<div class="field">
					<textarea rows="2" bind:value={t.text} oninput={textChanged}></textarea>
				</div>
				<div class="field">
					<label for="font">Font</label>
					<select id="font" bind:value={t.font} onchange={textChanged}>
						{#each FONT_CHOICES as f (f.css)}
							<option value={f.css}>{f.label}</option>
						{/each}
					</select>
				</div>
				<div class="grid4">
					<div class="field">
						<label for="fs">Size</label>
						<input id="fs" type="number" min="4" max="128" bind:value={t.fontSize} oninput={textChanged} />
					</div>
					<div class="field">
						<label for="ls">Track</label>
						<input id="ls" type="number" min="-5" max="30" bind:value={t.letterSpacing} oninput={textChanged} />
					</div>
					<div class="field">
						<label for="al">Align</label>
						<select id="al" bind:value={t.align} onchange={save}>
							<option value="left">L</option>
							<option value="center">C</option>
							<option value="right">R</option>
						</select>
					</div>
					<div class="field">
						<label for="tc">Ink</label>
						<select id="tc" bind:value={t.color} onchange={save}>
							<option value="black">Black</option>
							<option value="white">White</option>
						</select>
					</div>
				</div>
				<div class="row2">
					<label class="chk"
						><input
							type="checkbox"
							checked={t.weight === 700}
							onchange={(e) => {
								t.weight = (e.currentTarget as HTMLInputElement).checked ? 700 : 400;
								textChanged();
							}}
						/> Bold</label
					>
					<label class="chk"
						><input type="checkbox" bind:checked={t.italic} onchange={textChanged} /> Italic</label
					>
				</div>
			</section>
		{:else if l.type === 'image' || l.type === 'logo'}
			{@const im = l as ImageLayer}
			<section>
				<span class="eyebrow">{l.type === 'logo' ? 'Logo' : 'Image'} · tone</span>
				<div class="field">
					<label for="fit">Fit</label>
					<select id="fit" bind:value={im.fit} onchange={save}>
						<option value="fit">Fit (contain)</option>
						<option value="fill">Fill (cover)</option>
						<option value="stretch">Stretch</option>
					</select>
				</div>
				<div class="field">
					<label for="br">Brightness <b>{im.brightness}</b></label>
					<input id="br" type="range" min="-100" max="100" bind:value={im.brightness} oninput={save} />
				</div>
				<div class="field">
					<label for="ct">Contrast <b>{im.contrast}</b></label>
					<input id="ct" type="range" min="-100" max="100" bind:value={im.contrast} oninput={save} />
				</div>
				<div class="field">
					<label for="gm">Gamma <b>{im.gamma.toFixed(2)}</b></label>
					<input id="gm" type="range" min="0.2" max="3" step="0.05" bind:value={im.gamma} oninput={save} />
				</div>
			</section>
		{:else if l.type === 'shape'}
			{@const s = l as ShapeLayer}
			<section>
				<span class="eyebrow">Shape</span>
				<div class="grid4">
					<div class="field">
						<label for="sk">Kind</label>
						<select id="sk" bind:value={s.shape} onchange={save}>
							<option value="rect">Rect</option>
							<option value="ellipse">Ellipse</option>
							<option value="line">Line</option>
						</select>
					</div>
					<div class="field">
						<label for="sf">Fill</label>
						<select id="sf" bind:value={s.fill} onchange={save}>
							<option value="black">Black</option>
							<option value="white">White</option>
							<option value="none">None</option>
						</select>
					</div>
					<div class="field">
						<label for="ss">Stroke</label>
						<select id="ss" bind:value={s.stroke} onchange={save}>
							<option value="black">Black</option>
							<option value="white">White</option>
							<option value="none">None</option>
						</select>
					</div>
					<div class="field">
						<label for="sw">Weight</label>
						<input id="sw" type="number" min="0" max="20" bind:value={s.strokeWidth} oninput={save} />
					</div>
				</div>
				{#if s.shape === 'rect'}
					<div class="field">
						<label for="rd">Corner radius <b>{s.radius}</b></label>
						<input id="rd" type="range" min="0" max="40" bind:value={s.radius} oninput={save} />
					</div>
				{/if}
			</section>
		{/if}

		<!-- PER-LAYER DITHER -->
		<section>
			<span class="eyebrow">Layer dither</span>
			<div class="field">
				<label for="ld">Mode</label>
				<select id="ld" bind:value={l.dither} onchange={save}>
					<option value="inherit">Inherit (global)</option>
					{#each ditherModes as m (m)}
						<option value={m}>{DITHER_LABELS[m]}</option>
					{/each}
				</select>
			</div>
			{#if l.dither !== 'inherit'}
				<div class="field">
					<label for="lt">Threshold <b>{l.threshold}</b></label>
					<input id="lt" type="range" min="0" max="255" bind:value={l.threshold} oninput={save} />
				</div>
				<label class="chk"
					><input type="checkbox" bind:checked={l.invert} onchange={save} /> Invert layer</label
				>
			{/if}
		</section>
	{/if}
</div>

<style>
	.insp {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 0;
		border-bottom: 1px solid var(--line);
	}
	section:last-child {
		border-bottom: none;
	}
	.none {
		color: var(--fg-faint);
		font-style: italic;
		padding: 16px 0;
		font-size: 12px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.field b {
		color: var(--accent);
		font-family: var(--mono);
	}
	.grid4 {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1fr;
		gap: 6px;
	}
	.row2 {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.chk {
		display: flex;
		align-items: center;
		gap: 5px;
		cursor: pointer;
		color: var(--fg);
	}
	.inline {
		flex-direction: row;
		align-items: center;
		gap: 6px;
	}
	textarea {
		resize: vertical;
		font-family: var(--mono);
	}
</style>
