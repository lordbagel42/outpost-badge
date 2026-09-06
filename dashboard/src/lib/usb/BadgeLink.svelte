<script lang="ts">
	import { onMount } from 'svelte';
	import { badge } from './badge.svelte';

	let serialSupported = $state(true);
	let busy = $state(false);

	onMount(() => {
		serialSupported = typeof navigator !== 'undefined' && 'serial' in navigator;
	});

	const modeLabels = ['DOOM', 'BADGE', 'HELP'];

	const statusMeta: Record<string, { label: string; color: string }> = {
		disconnected: { label: 'DISCONNECTED', color: 'var(--fg-faint)' },
		connecting: { label: 'CONNECTING', color: 'var(--warn)' },
		connected: { label: 'CONNECTED', color: 'var(--good)' },
		bootsel: { label: 'BOOTSEL', color: 'var(--accent)' },
		error: { label: 'ERROR', color: 'var(--bad)' }
	};

	let meta = $derived(statusMeta[badge.status] ?? statusMeta.disconnected);
	let version = $derived(badge.info ? `${badge.info.verMajor}.${badge.info.verMinor}` : '--');
	let modeLabel = $derived(badge.info ? (modeLabels[badge.info.mode] ?? `#${badge.info.mode}`) : '--');

	async function toggle() {
		busy = true;
		try {
			if (badge.status === 'connected') {
				await badge.disconnect();
			} else {
				await badge.connect();
			}
		} catch {
			// badge.lastError already reflects the failure.
		} finally {
			busy = false;
		}
	}

	async function reboot() {
		busy = true;
		try {
			await badge.rebootBootsel();
		} catch {
			// ignore; status/lastError updated by the singleton.
		} finally {
			busy = false;
		}
	}
</script>

<section class="link">
	<header class="link-head">
		<div>
			<div class="eyebrow">USB LINK</div>
			<h3 class="mono">Badge connection</h3>
		</div>
		<span class="pill">
			<span
				class="dot"
				class:live={badge.status === 'connecting'}
				style="background:{meta.color}; color:{meta.color}"
			></span>
			{meta.label}
		</span>
	</header>

	{#if !serialSupported}
		<div class="notice bad">
			<strong>Web Serial required.</strong> This browser can't talk to the badge. Open the studio in
			<strong>Chrome</strong> or <strong>Edge</strong> on desktop.
		</div>
	{:else}
		<div class="controls">
			<button
				class="primary"
				onclick={toggle}
				disabled={busy || badge.status === 'connecting'}
			>
				{#if badge.status === 'connected'}Disconnect{:else if badge.status === 'connecting'}Connecting…{:else}Connect badge{/if}
			</button>
			{#if badge.status !== 'connected' && badge.status !== 'connecting'}
				<span class="hint">Plug in a badge running firmware, then connect.</span>
			{/if}
		</div>

		{#if badge.status === 'connected' && badge.info}
			<dl class="info">
				<div><dt>ID</dt><dd class="mono">{badge.id || '—'}</dd></div>
				<div><dt>VERSION</dt><dd class="mono">{version}</dd></div>
				<div><dt>MODE</dt><dd class="mono">{modeLabel}</dd></div>
				<div>
					<dt>CUSTOM IMAGE</dt>
					<dd class="mono">{badge.info.hasCustom ? 'STORED' : 'none'}</dd>
				</div>
				<div><dt>NAME</dt><dd class="mono">{badge.info.name || '—'}</dd></div>
			</dl>
		{/if}

		{#if badge.lastError}
			<div class="notice bad err mono">⚠ {badge.lastError}</div>
		{/if}
	{/if}

	<details class="flash" open={badge.status === 'bootsel'}>
		<summary>Flash a blank badge</summary>
		<div class="flash-body">
			<p>
				A badge with <strong>no firmware</strong> shows up as a USB drive named
				<code>RP2350</code> instead of a serial port. Load the firmware once by drag-and-drop:
			</p>
			<div class="dl-row">
				<a class="btn primary" href="/firmware/outpost-advanced.uf2" download>
					↓ Download firmware (.uf2)
				</a>
			</div>
			<ol class="steps">
				<li>
					<strong>Hold the BOOTSEL button</strong> while you plug the badge into USB (or use the button
					below if firmware is already running).
				</li>
				<li>A drive named <code>RP2350</code> appears in your file manager.</li>
				<li>Drag <code>outpost-advanced.uf2</code> onto that drive.</li>
				<li>The badge reboots automatically into the Outpost firmware — then hit <em>Connect</em>.</li>
			</ol>
			<div class="reboot-row">
				<button
					class="ghost"
					onclick={reboot}
					disabled={busy || badge.status !== 'connected'}
					title={badge.status === 'connected'
						? 'Reboot the connected badge into BOOTSEL'
						: 'Connect a firmware badge first'}
				>
					⟳ Reboot my badge to BOOTSEL
				</button>
				<span class="hint">For badges already running firmware.</span>
			</div>
		</div>
	</details>
</section>

<style>
	.link {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 16px;
		background: var(--panel, #0f1216);
		border: 1px solid var(--line, #23262c);
		border-radius: var(--radius, 3px);
		box-shadow: var(--shadow, 0 2px 0 rgba(0, 0, 0, 0.5));
	}
	.link-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.link-head h3 {
		margin: 2px 0 0;
		font-size: 15px;
		letter-spacing: 0.02em;
	}
	.dot.live {
		animation: blink 1s steps(1) infinite;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.hint {
		font-family: var(--mono-ui, monospace);
		font-size: 11px;
		color: var(--fg-dim, #8b929b);
	}
	.info {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 1px;
		margin: 0;
		background: var(--line, #23262c);
		border: 1px solid var(--line, #23262c);
		border-radius: var(--radius, 3px);
		overflow: hidden;
	}
	.info > div {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 9px 11px;
		background: var(--bg-1, #0d0f12);
	}
	.info dt {
		font-family: var(--mono-ui, monospace);
		font-size: 9.5px;
		letter-spacing: 0.12em;
		color: var(--fg-faint, #575e68);
	}
	.info dd {
		margin: 0;
		font-size: 13px;
		color: var(--fg, #d7dce1);
		word-break: break-word;
	}
	.notice {
		font-size: 12px;
		line-height: 1.5;
		padding: 10px 12px;
		border: 1px solid var(--line, #23262c);
		border-radius: var(--radius, 3px);
		background: var(--bg-1, #0d0f12);
	}
	.notice.bad {
		border-color: color-mix(in srgb, var(--bad, #e5484d) 55%, var(--line));
	}
	.notice.err {
		color: var(--bad, #e5484d);
		font-size: 11.5px;
	}
	.flash {
		border: 1px solid var(--line, #23262c);
		border-radius: var(--radius, 3px);
		background: var(--bg-0, #08090b);
	}
	.flash > summary {
		cursor: pointer;
		padding: 10px 12px;
		font-family: var(--mono, monospace);
		font-size: 12.5px;
		letter-spacing: 0.02em;
		color: var(--accent, #f5a623);
		list-style: none;
	}
	.flash > summary::-webkit-details-marker {
		display: none;
	}
	.flash > summary::before {
		content: '▸ ';
		color: var(--fg-faint, #575e68);
	}
	.flash[open] > summary::before {
		content: '▾ ';
	}
	.flash-body {
		padding: 4px 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--fg-dim, #8b929b);
		border-top: 1px solid var(--line, #23262c);
	}
	.flash-body code {
		font-family: var(--mono, monospace);
		font-size: 11.5px;
		padding: 1px 5px;
		background: var(--bg-2, #121519);
		border: 1px solid var(--line, #23262c);
		border-radius: 2px;
		color: var(--paper, #e9e4d6);
	}
	.dl-row {
		display: flex;
	}
	.steps {
		margin: 0;
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.steps li {
		color: var(--fg, #d7dce1);
	}
	.steps code {
		white-space: nowrap;
	}
	.reboot-row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		padding-top: 4px;
		border-top: 1px dashed var(--line, #23262c);
	}
</style>
