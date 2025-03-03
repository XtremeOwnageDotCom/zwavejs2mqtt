<template>
	<div>
		<v-container fluid class="pa-4">
			<v-row class="py-4 align-center" no-gutters>
				<v-col class="text-end">
					<v-menu>
						<template #activator="{ on }">
							<v-item-group class="v-btn-toggle">
								<v-btn
									color="primary"
									outlined
									@click="toggleControllerStatistics"
								>
									<v-icon left>
										{{ statisticsOpeningIndicator }}
									</v-icon>
									Controller statistics
									<v-icon color="primary" right>
										multiline_chart
									</v-icon>
								</v-btn>
								<v-btn color="primary" outlined v-on="on">
									Actions
									<v-icon right>arrow_drop_down</v-icon>
								</v-btn>
							</v-item-group>
						</template>

						<v-list>
							<v-list-item @click="addRemoveShowDialog = true">
								<v-list-item-content
									class="d-none d-sm-inline-flex"
								>
									<v-list-item-title>
										Manage nodes
									</v-list-item-title>
									<v-list-item-subtitle>
										Include, replace or exclude devices
									</v-list-item-subtitle>
								</v-list-item-content>
								<v-list-item-action>
									<v-btn
										depressed
										outlined
										color="primary"
										@click="addRemoveShowDialog = true"
									>
										Manage nodes
									</v-btn>
								</v-list-item-action>
							</v-list-item>
							<v-divider />
							<v-list-item @click="advancedShowDialog = true">
								<v-list-item-content
									class="d-none d-sm-inline-flex"
								>
									<v-list-item-title>
										Advanced actions
									</v-list-item-title>
									<v-list-item-subtitle>
										Maintainance, troubleshooting and other
										advanced actions
									</v-list-item-subtitle>
								</v-list-item-content>
								<v-list-item-action>
									<v-btn
										dark
										color="green"
										depressed
										outlined
										@click="advancedShowDialog = true"
									>
										Advanced actions
									</v-btn>
								</v-list-item-action>
							</v-list-item>
						</v-list>
					</v-menu>
				</v-col>
			</v-row>
			<v-expand-transition>
				<v-row v-show="showControllerStatistics">
					<v-col class="mb-8">
						<v-sheet outlined rounded>
							<StatisticsCard
								v-if="true || controllerNode"
								title="Controller Statistics"
								:node="this.controllerNode"
							/>
						</v-sheet>
					</v-col>
				</v-row>
			</v-expand-transition>
			<nodes-table
				:socket="socket"
				v-on="$listeners"
				@action="sendAction"
			/>
		</v-container>

		<DialogAddRemove
			v-model="addRemoveShowDialog"
			:socket="socket"
			@close="onAddRemoveClose"
			@apiRequest="apiRequest"
			v-on="{ showConfirm: $listeners.showConfirm }"
		/>

		<DialogAdvanced
			v-model="advancedShowDialog"
			@close="advancedShowDialog = false"
			:actions="actions"
			@action="onAction"
		/>
	</div>
</template>

<script>
import ConfigApis from '@/apis/ConfigApis'
import { mapGetters, mapMutations } from 'vuex'

import DialogAddRemove from '@/components/dialogs/DialogAddRemove'
import DialogAdvanced from '@/components/dialogs/DialogAdvanced'
import NodesTable from '@/components/nodes-table'
import { Settings } from '@/modules/Settings'
import { jsonToList } from '@/lib/utils'
import { socketEvents } from '@/plugins/socket'
import StatisticsCard from '@/components/custom/StatisticsCard'

export default {
	name: 'ControlPanel',
	props: {
		socket: Object,
	},
	components: {
		NodesTable,
		DialogAddRemove,
		DialogAdvanced,
		StatisticsCard,
	},
	computed: {
		...mapGetters(['nodes', 'zwave']),
		timeoutMs() {
			return this.zwave.commandsTimeout * 1000 + 800 // add small buffer
		},
		controllerNode() {
			return this.nodes.find((n) => n.isControllerNode)
		},
		statisticsOpeningIndicator() {
			return this.showControllerStatistics
				? 'arrow_drop_up'
				: 'arrow_drop_down'
		},
	},
	watch: {},
	data() {
		return {
			settings: new Settings(localStorage),
			bindedSocketEvents: {}, // keep track of the events-handlers
			addRemoveShowDialog: false,
			advancedShowDialog: false,
			actions: [
				{
					text: 'Backup',
					options: [
						{ name: 'Import', action: 'import' },
						{ name: 'Export', action: 'export' },
					],
					icon: 'save',
					desc: 'Save or load `nodes.json` file with names and locations',
				},
				{
					text: 'Dump',
					options: [{ name: 'Export', action: 'exportDump' }],
					icon: 'bug_report',
					desc: 'Export all nodes in a json file. Useful for debugging purposes',
				},
				{
					text: 'Heal Network',
					options: [
						{
							name: 'Begin',
							action: 'beginHealingNetwork',
							args: {
								confirm:
									'Healing network causes a lot of traffic, can take minutes up to hours and users have to expect degraded performance while it is going on',
							},
						},
						{ name: 'Stop', action: 'stopHealingNetwork' },
					],
					icon: 'healing',
					desc: 'Force nodes to establish better connections to the controller',
				},
				{
					text: 'Re-interview Nodes',
					options: [
						{
							name: 'Start',
							action: 'refreshInfo',
							args: {
								broadcast: true,
							},
						},
					],
					icon: 'history',
					desc: 'Clear all info about all nodes and make a new full interview. Use when nodes has wrong or missing capabilities',
				},
				{
					text: 'Hard Reset',
					options: [
						{
							name: 'Factory Reset',
							action: 'hardReset',
						},
					],
					icon: 'warning',
					color: 'red',
					desc: 'Reset controller to factory defaults (all paired devices will be removed)',
				},
				{
					text: 'Soft Reset',
					options: [
						{
							name: 'Soft Reset',
							action: 'softReset',
							args: {
								confirm: `<p>Are you sure you want to soft-reset your controller?</p>
									<p>USB modules will reconnect, meaning that they might get a new address. Make sure to configure your device address in a way that prevents it from changing, e.g. by using <code>/dev/serial/by-id/...</code> on Linux.</p>
									<p><strong>This method may cause problems in Docker containers with certain Z-Wave stick.</strong> If that happens, you may need to restart your host OS and docker container.</p>`,
							},
						},
					],
					icon: 'refresh',
					color: 'warning',
					desc: 'Instruct the controller to soft-reset (restart)',
				},
				{
					text: 'Failed Nodes',
					options: [
						{
							name: 'Remove all',
							action: 'removeFailedNode',
							args: {
								broadcast: true,
								confirm:
									'This action will remove all failed nodes. ATTENTION: this will skip sleeping nodes to prevent unwanted behaviours',
							},
						},
					],
					icon: 'dangerous',
					desc: 'Manage nodes that are dead and/or marked as failed with the controller',
				},
				{
					text: 'Driver function',
					options: [
						{
							name: 'Write',
							action: 'driverFunction',
						},
					],
					icon: 'code',
					desc: 'Write a custom JS function using the ZwaveJS Driver',
				},
				{
					text: 'NVM Management',
					options: [
						{ name: 'Backup', action: 'backupNVMRaw' },
						{ name: 'Restore', action: 'restoreNVM' },
					],
					icon: 'update',
					desc: "Backup/Restore controller's NVM (Non Volatile Memory)",
				},
			],
			rules: {
				required: (value) => {
					let valid = false

					if (value instanceof Array) valid = value.length > 0
					else valid = !isNaN(value) || !!value // isNaN is for 0 as valid value

					return valid || 'This field is required.'
				},
			},
			showControllerStatistics: false,
		}
	},
	methods: {
		...mapMutations(['showSnackbar', 'setHealProgress']),
		jsonToList,
		onAddRemoveClose() {
			this.addRemoveShowDialog = false
		},
		async onAction(action, args = {}) {
			if (action === 'import') {
				this.importConfiguration()
			} else if (action === 'export') {
				this.exportConfiguration()
			} else if (action === 'exportDump') {
				this.exportDump()
			} else {
				this.sendAction(action, args)
			}
		},
		async importConfiguration() {
			if (
				await this.$listeners.showConfirm(
					'Attention',
					'This will override all existing nodes names and locations',
					'alert'
				)
			) {
				try {
					const { data } = await this.$listeners.import('json')
					const response = await ConfigApis.importConfig({
						data: data,
					})
					this.showSnackbar(response.message)
				} catch (error) {
					console.log(error)
				}
			}
		},
		exportConfiguration() {
			const self = this
			ConfigApis.exportConfig()
				.then((data) => {
					self.showSnackbar(data.message)
					if (data.success) {
						self.$listeners.export(data.data, 'nodes', 'json')
					}
				})
				.catch((error) => {
					console.log(error)
				})
		},
		exportDump() {
			this.$listeners.export(this.nodes, 'nodes_dump', 'json')
		},
		async sendAction(action, { nodeId, broadcast, confirm }) {
			if (action) {
				if (confirm) {
					const ok = await this.$listeners.showConfirm(
						'Info',
						confirm,
						'info',
						{
							cancelText: 'cancel',
							confirmText: 'ok',
							width: 900,
						}
					)

					if (!ok) {
						return
					}
				}
				const args = []
				if (nodeId !== undefined) {
					if (!broadcast) {
						if (isNaN(nodeId)) {
							this.showSnackbar(
								'Node ID must be an integer value'
							)
							return
						}
						args.push(parseInt(nodeId))
					}
				}

				if (action === 'startInclusion') {
					const secure = await this.$listeners.showConfirm(
						'Node inclusion',
						'Start inclusion in secure mode?',
						'info',
						{
							cancelText: 'No',
						}
					)
					args.push(secure)
				} else if (action === 'hardReset') {
					const { confirm } = await this.$listeners.showConfirm(
						'Hard Reset',
						'Your controller will be reset to factory and all paired devices will be removed',
						'alert',
						{
							confirmText: 'Ok',
							inputs: [
								{
									type: 'text',
									label: 'Confirm',
									required: true,
									key: 'confirm',
									hint: 'Type "yes" and press OK to confirm',
								},
							],
						}
					)
					if (!confirm || confirm !== 'yes') {
						return
					}
				} else if (action === 'beginFirmwareUpdate') {
					try {
						const { target } = await this.$listeners.showConfirm(
							'Choose target',
							'',
							'info',
							{
								confirmText: 'Ok',
								inputs: [
									{
										type: 'number',
										label: 'Target',
										default: 0,
										rules: [
											(v) => v >= 0 || 'Invalid target',
										],
										hint: 'The firmware target (i.e. chip) to upgrade. 0 updates the Z-Wave chip, >=1 updates others if they exist',
										required: true,
										key: 'target',
									},
								],
							}
						)

						if (target === undefined)
							throw Error('Must specify a target')

						const { data, file } = await this.$listeners.import(
							'buffer'
						)
						args.push(file.name)
						args.push(data)
						args.push(target)
					} catch (error) {
						return
					}
				} else if (action === 'driverFunction') {
					const { code } = await this.$listeners.showConfirm(
						'Driver function',
						'',
						'info',
						{
							width: 900,
							confirmText: 'Send',
							inputs: [
								{
									type: 'code',
									key: 'code',
									default:
										'// Example:\n// const node = driver.controller.nodes.get(35);\n// await node.refreshInfo();',
									hint: `Write the function here. The only arg is:
                    <code>driver</code>. The function is <code>async</code>.`,
								},
							],
						}
					)

					if (!code) {
						return
					}

					args.push(code)
				} else if (action === 'backupNVMRaw') {
					const confirm = await this.$listeners.showConfirm(
						'NVM Backup',
						'While doing the backup the Z-Wave radio will be turned on/off',
						'alert',
						{
							confirmText: 'Ok',
						}
					)
					if (!confirm) {
						return
					}
				} else if (action === 'restoreNVM') {
					const confirm = await this.$listeners.showConfirm(
						'NVM Restore',
						'While doing the restore the Z-Wave radio will be turned on/off.\n<strong>A failure during this process may brick your controller. Use at your own risk!</strong>',
						'alert',
						{
							confirmText: 'Ok',
						}
					)
					if (!confirm) {
						return
					}

					try {
						const { data } = await this.$listeners.import('buffer')
						args.push(data)
					} catch (error) {
						return
					}
				} else if (action === 'refreshInfo') {
					const options = await this.$listeners.showConfirm(
						'Refresh info',
						`Are you sure you want to re-interview ${
							broadcast ? 'all nodes' : 'node ' + nodeId
						}? All known information about your nodes will be discarded. Battery powered nodes need to be woken up, interaction with the nodes won't be reliable until the interview is done.`,
						'info',
						{
							width: 900,
							confirmText: 'Ok',
							inputs: [
								{
									type: 'checkbox',
									key: 'resetSecurityClasses',
									default: false,
									label: 'Reset security classes',
								},
							],
						}
					)

					if (!options || Object.keys(options).length === 0) {
						return
					}

					args.push(options)
				}

				if (broadcast) {
					let nodes = this.nodes

					// ignore sleeping nodes in broadcast request. Fixes #983
					if (action === 'removeFailedNode') {
						nodes = nodes.filter((n) => n.status !== 'Asleep')
					}

					for (let i = 0; i < nodes.length; i++) {
						const nodeid = nodes[i].id
						this.apiRequest(action, [nodeid])
					}
				} else {
					this.apiRequest(action, args)
				}
			}
		},
		apiRequest(apiName, args) {
			this.$emit('apiRequest', apiName, args)
		},
		saveConfiguration() {
			this.apiRequest('writeConfig', [])
		},
		onApiResponse(data) {
			if (data.success) {
				switch (data.api) {
					case 'getDriverStatistics':
						this.$listeners.showConfirm(
							'Driver statistics',
							this.jsonToList(data.result)
						)
						break
					case 'getNodeStatistics':
						this.$listeners.showConfirm(
							'Node statistics',
							this.jsonToList(data.result)
						)
						break
					case 'backupNVMRaw':
						{
							this.showSnackbar(
								'NVM Backup DONE. You can find your file NVM_<date>.bin in store directory'
							)
							const { result } = data
							this.$listeners.export(
								result.data,
								result.fileName,
								'bin'
							)
						}
						break
					case 'restoreNVM':
						this.showSnackbar('NVM restore DONE')
						break
					default:
						this.showSnackbar('Successfully call api ' + data.api)
				}
			} else {
				this.showSnackbar(
					'Error while calling api ' + data.api + ': ' + data.message
				)
			}
		},
		bindEvent(eventName, handler) {
			this.socket.on(socketEvents[eventName], handler)
			this.bindedSocketEvents[eventName] = handler
		},
		unbindEvents() {
			for (const event in this.bindedSocketEvents) {
				this.socket.off(
					socketEvents[event],
					this.bindedSocketEvents[event]
				)
			}
		},
		toggleControllerStatistics() {
			this.showControllerStatistics = !this.showControllerStatistics
		},
	},
	mounted() {
		const onApiResponse = this.onApiResponse.bind(this)
		const onHealProgress = this.setHealProgress.bind(this)

		this.bindEvent('api', onApiResponse)
		this.bindEvent('healProgress', onHealProgress)
	},
	beforeDestroy() {
		if (this.socket) {
			this.unbindEvents()
		}
	},
}
</script>
