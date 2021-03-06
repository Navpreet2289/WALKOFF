import { Component, Input, ViewEncapsulation, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastyService, ToastyConfig } from 'ng2-toasty';
import * as d3 from 'd3';
import { TreeLayout } from 'd3';
import { Selection, EnterElement } from 'd3-selection';

import { CasesService } from './cases.service';

import { Case } from '../models/case/case';
import { CaseNode } from '../models/case/caseNode';
import { AvailableSubscription } from '../models/case/availableSubscription';
import { Subscription } from '../models/case/subscription';

@Component({
	encapsulation: ViewEncapsulation.None,
	selector: 'case-modal',
	templateUrl: './cases.modal.html',
	styleUrls: [
		'./cases.modal.css',
	],
	providers: [CasesService],
})
export class CasesModalComponent implements OnInit {
	@Input() workingCase: Case;
	@Input() title: string;
	@Input() submitText: string;
	@Input() availableSubscriptions: AvailableSubscription[] = [];
	@Input() subscriptionTree: CaseNode;
	@Input() workingEvents: Array<{ name: string, isChecked: boolean }> = [];

	selectedNode: { name: string, id: string, type: string } = { name: '', id: '', type: '' };
	treemap: TreeLayout<{}>;
	svg: Selection<Element | EnterElement | Document | Window, {}, HTMLElement, Window> ;
	root: any;
	i = 0;
	existingSubscriptionIds: string[];

	constructor(
		private casesService: CasesService, private activeModal: NgbActiveModal,
		private toastyService: ToastyService, private toastyConfig: ToastyConfig,
	) {}

	/**
	 * On component init, we want to build our D3 subscriptin tree from the subscriptionTree CaseNode hierarchy supplied.
	 * Most of this logic is taken from https://bl.ocks.org/mbostock/4339083 and has been edited to fit our use case.
	 * Some other updates were applied to better separate data and improve readability via arrow function notation etc.
	 */
	ngOnInit(): void {
		this.toastyConfig.theme = 'bootstrap';
		this.existingSubscriptionIds = this.workingCase.subscriptions.map(s => s.id);

		// Set the dimensions and margins of the diagram
		const margin = { top: 20, right: 90, bottom: 30, left: 90 };
		const width = 1350 - margin.left - margin.right;
		const height = 500 - margin.top - margin.bottom;

		// appends a 'group' element to 'svg'
		// moves the 'group' element to the top left margin
		this.svg = d3.select('svg#caseSubscriptionsTree')
			.attr('width', width + margin.right + margin.left)
			.attr('height', height + margin.top + margin.bottom)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		// declares a tree layout and assigns the size
		this.treemap = d3.tree().size([height, width]);

		// Assigns parent, children, height, depth
		this.root = d3.hierarchy(this.subscriptionTree);
		this.root.x0 = height / 2;
		this.root.y0 = 0;

		//Mark our controller as included if necessary
		if (this.existingSubscriptionIds.indexOf('controller') >= 0) { this.root.data._included = true; }

		// Check for collapse after the second level
		if (this.root.children && this.root.children.length) {
			this.root.children.forEach((d: any) => this.checkInclusionAndCheckChildrenForExpansion(d));
		}

		this.update(this.root);
	}

	/**
	 * Updates a node and its children based on whether they should be expanded or not, etc.
	 * Called initially and whenever nodes are double clicked to expand/collapse.
	 * Most of this logic is taken from https://bl.ocks.org/mbostock/4339083 and has been edited to fit our use case.
	 * Some other updates were applied to better separate data and improve readability via arrow function notation etc.
	 * @param source Source node to update
	 */
	update(source: any): void {
		const duration = 400;
		// Assigns the x and y position for the nodes
		const treeData = this.treemap(this.root);

		// Compute the new tree layout.
		const nodes = treeData.descendants();
		const links = treeData.descendants().slice(1);

		// Normalize for fixed-depth.
		nodes.forEach(d => d.y = d.depth * 180);

		// ****************** Nodes section ***************************
		// Update the nodes...
		const node = this.svg.selectAll('g.node')
			.data(nodes, (d: any) => d.id || (d.id = ++this.i));

		// Enter any new modes at the parent's previous position.
		const nodeEnter = node.enter().append('g')
			.classed('node', true)
			.classed('included', (d: any) => d.data._included)
			.attr('transform', d => `translate(${source.y0},${source.x0})`)
			.attr('id', (d: any) => `id-${d.data.id}`)
			.on('click', d => this.click(d))
			.on('dblclick', d => this.dblclick(d));

		// Add Circle for the nodes
		nodeEnter.append('circle')
			.classed('node', true)
			.attr('r', 1e-6)
			.style('fill', (d: any) => d._children ? 'lightsteelblue' : '#fff');

		// Add labels for the nodes
		nodeEnter.append('text')
			.attr('dy', '.35em')
			.attr('x', (d: any) => d.children || d._children ? -13 : 13)
			.attr('text-anchor', (d: any) => d.children || d._children ? 'end' : 'start')
			.text((d: any) => d.data.name);

		// UPDATE
		const nodeUpdate = nodeEnter.merge(node);

		// Transition to the proper position for the node
		nodeUpdate.transition()
			.duration(duration)
			.attr('transform', d => `translate(${d.y},${d.x})`);

		// Update the node attributes and style
		nodeUpdate.select('circle.node')
			.attr('r', 10)
			.style('fill', (d: any) => d._children ? 'lightsteelblue' : '#fff');

		// Remove any exiting nodes
		const nodeExit = node.exit().transition()
			.duration(duration)
			.attr('transform', d => `translate(${source.y},${source.x})`)
			.remove();

		// On exit reduce the node circles size to 0
		nodeExit.select('circle')
			.attr('r', 1e-6);

		// On exit reduce the opacity of text labels
		nodeExit.select('text')
			.style('fill-opacity', 1e-6);

		// ****************** links section ***************************

		// Update the links...
		const link = this.svg.selectAll('path.link')
			.data(links, (d: any) => d.id);

		// Enter any new links at the parent's previous position.
		const linkEnter = link.enter().insert('path', 'g')
			.classed('link', true)
			.attr('d', d => {
				const o = { x: source.x0, y: source.y0 };
				return this.diagonal(o, o);
			});

		// UPDATE
		const linkUpdate = linkEnter.merge(link);

		// Transition back to the parent element position
		linkUpdate.transition()
			.duration(duration)
			.attr('d', d => this.diagonal(d, d.parent));

		// Remove any exiting links
		link.exit().transition()
			.duration(duration)
			.attr('d', d => {
				const o = { x: source.x, y: source.y };
				return this.diagonal(o, o);
			})
			.remove();

		// Store the old positions for transition.
		nodes.forEach((d: any) => {
			d.x0 = d.x;
			d.y0 = d.y;
		});
	}

	/**
	 * This function recursively checks if each node should be included or expanded.
	 * @param d Node data
	 */
	checkInclusionAndCheckChildrenForExpansion(d: any): boolean {
		if (this.existingSubscriptionIds.indexOf(d.data.id) >= 0) { d.data._included = true; }
		let expanded = false;

		if (d.children) {
			d.children.forEach((child: any) => {
				expanded = this.checkInclusionAndCheckChildrenForExpansion(child) || expanded;
			});
		}

		if (!expanded && d.children) {
			d._children = d.children;
			d.children = null;
		}
		
		return d.data._included;
	}

	/**
	 * Creates a curved (diagonal) path from parent to the child nodes.
	 * @param s Source node
	 * @param d Destination node
	 */
	diagonal(s: any, d: any): string {
		return `M ${s.y} ${s.x}
			C ${(s.y + d.y) / 2} ${s.x},
			${(s.y + d.y) / 2} ${d.x},
			${d.y} ${d.x}`;
	}

	/**
	 * Selects our node on click.
	 * @param d Node data
	 */
	click(d: any): void {
		if (!d.data.type) { return; }

		this.selectedNode = { name: d.data.name, id: d.data.id, type: d.data.type };

		const availableEvents = this.availableSubscriptions.find(a => a.type === d.data.type).events;

		const subscription = this.workingCase.subscriptions.find(s => s.id === d.data.id);

		const subscriptionEvents = subscription ? subscription.events : [];

		this.workingEvents = [];

		availableEvents.forEach(event => {
			this.workingEvents.push({
				name: event,
				isChecked: subscriptionEvents.indexOf(event) > -1,
			});
		});

		//Clear highlighting on other highlighted node(s)
		d3.selectAll('g.node.highlighted')
			.classed('highlighted', false);

		//Highlight this node now.
		d3.select(`g.node#id-${this.selectedNode.id}`)
			.classed('highlighted', true);
	}

	/**
	 * Toggle children on double click.
	 * @param d Node data
	 */
	dblclick(d: any): void {
		if (d.children) {
			d._children = d.children;
			d.children = null;
		} else {
			d.children = d._children;
			d._children = null;
		}
		this.update(d);
	}

	/**
	 * If we check or uncheck an event, we need to update the backing model.
	 * If we are checking an event on an execution element we're not including, include it.
	 * Re-filter the selected events for our subscription afterward. Remove the subscription if no events remain.
	 * @param event JS Event fired on checking or unchecking an event after having selected a node
	 * @param isChecked Value of the check box
	 */
	handleEventSelectionChange(event: any, isChecked: boolean): void {
		if (!this.selectedNode.name) {
			console.error('Attempted to select events without a node selected.');
			return;
		}

		event.isChecked = isChecked;

		let matchingSubscription = this.workingCase.subscriptions.find(s => s.id === this.selectedNode.id);

		//If no subscription is returned, it doesn't exist yet; add it.
		if (!matchingSubscription) {
			matchingSubscription = new Subscription();
			matchingSubscription.id = this.selectedNode.id;

			this.workingCase.subscriptions.push(matchingSubscription);

			//style the node in d3 as well
			d3.select('svg#caseSubscriptionsTree').select(`g.node#id-${this.selectedNode.id}`)
				.classed('included', true)
				.datum((d: any) => {
					d.data._included = true;
					return d;
				});
		}

		//Recalculate our events on this subscription
		matchingSubscription.events = this.workingEvents.filter(we => we.isChecked).map(we => we.name);

		//If no more events are checked under this subscription, remove it.
		if (!matchingSubscription.events.length) {
			const indexToDelete = this.workingCase.subscriptions.indexOf(matchingSubscription);
			this.workingCase.subscriptions.splice(indexToDelete, 1);

			//style the node in d3 as well
			d3.select('svg#caseSubscriptionsTree').select(`g.node#id-${this.selectedNode.id}`)
				.classed('included', false)
				.datum((d: any) => {
					d.data._included = false;
					return d;
				});
		}
	}

	/**
	 * Submits the add/edit case modal.
	 * Calls POST/PUT based upon add/edit and returns the added/updated case from the server.
	 */
	submit(): void {
		const validationMessage = this.validate();
		if (validationMessage) {
			this.toastyService.error(validationMessage);
			return;
		}

		//If case has an ID, case already exists, call update
		if (this.workingCase.id) {
			this.casesService
				.editCase(this.workingCase)
				.then(c => this.activeModal.close({
					case: c,
					isEdit: true,
				}))
				.catch(e => this.toastyService.error(e.message));
		} else {
			this.casesService
				.addCase(this.workingCase)
				.then(c => this.activeModal.close({
					case: c,
					isEdit: false,
				}))
				.catch(e => this.toastyService.error(e.message));
		}
	}

	// TODO: decide what we want validated, if anything.
	validate(): string {
		return '';
	}
}
