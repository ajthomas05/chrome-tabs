chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {

	if (changeInfo.url) {
		console.log('onUpdated tabId', tabId);
		console.log('onUpdated changeInfo', changeInfo);
		console.log('onUpdated tab', tab);
		
		// No group is -1
		if (tab.groupId == -1) {
			updateTabOnChange(tab);
		}
	}
});

doInit = () => {
	chrome.tabs.query({
		url: [
			"https://*.force.com/*",
			"https://*.developerforce.com/*"
		]
	}).then((tabs) => {
		let tabGroups = groupTabs(tabs);
		
		getExistingTabGroups().then((groups) => {
			putTabsIntoGroup(groups, tabGroups);
		});
	});
}

updateTabOnChange = (tab) => {
	let org = parseOrg(new URL(tab.url).host);
	console.log('querying groups');
	chrome.tabGroups.query({title: org}).then((groups) => {
		console.log('onchange group', groups);
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

groupTabs = (tabs) => {
	// Get all tabs and group them by org (or workbench)
	let tabGroups = organizeTabs(tabs);
	console.log('tabGroups', tabGroups);
	return tabGroups;
}

organizeTabs = (tabs) => {
	let groupedTabs = [];

	for (tab of tabs) {
		let host = new URL(tab.url).host;

		if (groupedTabs[host] === undefined) {
			groupedTabs[host] = {};
		}

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

parseOrg = (host) => {
	let org = '';

	let dashdash = host.split('--')[1];
	
	// Sandbox
	if (dashdash) {
		org = dashdash.split('.')[0] || '';
	}

	// Prod
	else {
		org = 'prod';
	}

	return org;
}

getExistingTabGroups = () => {
	return chrome.tabGroups.query({});
}

putTabsIntoGroup = (existingGroups, newGroups) => {
	console.log('existingGroups', existingGroups);
	console.log('newGroups', newGroups);

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

		console.log('params:', params);
		
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