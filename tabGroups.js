/**
 * 
 * The intent of this plugin is to group your salesforce tabs by org.
 * 
 * The plugin reads your tab's URL, parses out the SANDBOX name, and uses that as the group name.
 * URL parsing is based on Salesforce documentation: https://help.salesforce.com/s/articleView?id=sf.data_sandbox_accessing_sandbox.htm&type=5
 * MyDomainName--SandboxName.sandbox.my.salesforce.com
 * 
 * If the plugin does not detect a '--' in the host, it will default to 'prod' as the group name.
 * 
 * Potential issues: 
 * 		If you have multiple ORGs you're working in, the SANDBOX could potentially be the same name. This will cause the plugin to group them together, regardless of the org.
 * 		If the workbench URL host ever changes (as it has in the past), the plugin will not detect it as a workbench tab.
 * 
 * ============================================================================
 * 
 * For transparency, these are the Google Chrome APIs used in this plugin:
 *		chrome.tabs.group
 *			- Used to group tabs. Will create group or add to a group.
 * 		chrome.tabs.onUpdated
 *			- Listener to detect URL changes
 * 		chrome.tabs.query
 * 			- Used to get all tabs with a specific URL
 * 		chrome.tabGroups.query
 * 			- Used to get all tab groups
 * 		chrome.tabGroups.update
 * 			- Used to update the group name
 * 
 */

/**
 * init. Called at the end of the js
 * 
 * Runs when the (you guessed it) plugin is initialized.
 */
doInit = () => {
	chrome.tabs.query({
		url: [
			"https://*.force.com/*",
			"https://*.developerforce.com/*"
		]
	}).then((tabs) => {
		let tabGroups = organizeTabs(tabs);
		
		getExistingTabGroups().then((groups) => {
			putTabsIntoGroup(groups, tabGroups);
		});
	});
}

/**
 * Chrome listener to detect URL changes. Will only run with tabs containing the allowed URLs in manifest.json
 * 
 * Only groups tabs if they are not already in a group.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	// No group is -1
	if (changeInfo.url && tab.groupId == -1) {
		updateTabOnChange(tab);
	}

	// TODO: ungroup if tab is no longer a salesforce tab? But this won't run because the URL is not in the manifest. Come back to this later.
});

/**
 * Uses the parsing logic to get the tab name, then puts the tab into a group. If the group does not exist, it will create a new group.
 */
updateTabOnChange = (tab) => {
	let org = parseOrg(new URL(tab.url).host);
	
	chrome.tabGroups.query({title: org}).then((groups) => {
		if (groups?.length > 0) {
			// There should only be one group *fingers crossed*
			let groupId = groups[0].id;

			chrome.tabs.group({groupId: groupId, tabIds: tab.id});
		}
		else {
			// Create a new group
			chrome.tabs.group({tabIds: tab.id}).then((groupId) => {
				chrome.tabGroups.update(groupId, {title: org});
			});
		}
	});
}

/**
 * Organize tabs by host.
 * 
 * returns an array of objects, with their key as the host.
 */
organizeTabs = (tabs) => {
	let groupedTabs = [];

	for (tab of tabs) {
		let host = new URL(tab.url).host;

		// Ensure the host is assigned a type
		if (groupedTabs[host] === undefined) {
			groupedTabs[host] = {};
		}

		// Ensure the host has a members array
		if (groupedTabs[host].members === undefined) {
			groupedTabs[host].members = [];
		}

		groupedTabs[host].id = host;
		groupedTabs[host].members.push(tab);

		if (host.includes('developerforce.com')) {
			groupedTabs[host].label = groupedTabs[host].label || 'Workbench';
		}
		else {
			groupedTabs[host].label = groupedTabs[host].label || parseOrg(host);
		}
	}

	return groupedTabs;
}

/**
 * Parse the org from the host. Takes the string between the '--' and the next '.'.
 */
parseOrg = (host) => {
	let org = 'prod';

	// Salesforce sandbox url = https://<org>--<sandbox>.sandbox.lightning.force.com
	let dashdash = host.split('--')[1];
	
	// Sandbox
	if (dashdash) {
		org = dashdash.split('.')[0] || '';
	}

	return org;
}

/**
 * Get all existing tab groups
 */
getExistingTabGroups = () => {
	return chrome.tabGroups.query({});
}

putTabsIntoGroup = (existingGroups, newGroups) => {
	Object.keys(newGroups).forEach(groupKey => {
		let group = newGroups[groupKey];
		let existingGroup = existingGroups.find(g => g.title === group.label);
		let groupTabs = group.members.map(tab => tab.id);

		let existingTabIds = existingGroup?.tabIds?.length > 0 ? existingGroup.tabIds : [];
		let newTabIds = groupTabs.filter(tabId => !existingTabIds.includes(tabId));
		let allTabIds = existingTabIds.concat(newTabIds);

		let params = {};

		if (existingGroup) {
			params = {groupId:existingGroup.id, tabIds: allTabIds};
		}
		else {
			params = {'tabIds':newTabIds};
		}

		chrome.tabs.group(params).then((groupId) => {
			group.groupId = groupId;
			labelGroup(group);
		});
	});
}

labelGroup = (group) => {
	chrome.tabGroups.update(group.groupId, {title: group.label});
}

// Run the init function
doInit();