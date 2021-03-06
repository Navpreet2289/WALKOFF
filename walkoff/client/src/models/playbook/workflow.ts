import { Type } from 'class-transformer';
import { Select2OptionData } from 'ng2-select2/ng2-select2';

import { Action } from './action';
import { Branch } from './branch';
import { ExecutionElement } from './executionElement';

export class Workflow extends ExecutionElement {
	// _playbook_id: number;
	/**
	 * Playbook ID this workflow resides under. Only used on create/duplicate.
	 */
	playbook_id?: string;

	/**
	 * Name of the workflow. Updated by passing in new_name in POST.
	 */
	name: string;

	/**
	 * Array of actions specified in the workflow.
	 */
	@Type(() => Action)
	actions?: Action[] = [];

	/**
	 * Array of branches between actions.
	 */
	@Type(() => Branch)
	branches?: Branch[] = [];

	/**
	 * ID of the action designated as the start action.
	 */
	start?: string;
	
	/**
	 * A factor of how often the workflow fails.
	 */
	accumulated_risk?: number;

	/**
	 * Returns true if this workflow doesn't contain any errors
	 */
	is_valid: boolean;

	/**
	 * Array of errors returned from the server for this Argument and any of its descendants 
	 */
	get all_errors(): string[] {
		return this.errors
				   .concat(...this.actions.map(action => action.all_errors))
				   .concat(...this.branches.map(branch => branch.all_errors))
	}

	listBranchCounters() : Select2OptionData[] {
		return this.branches.map(branch  => {
			const sourceAction = this.findActionById(branch.source_id);
			const destAction = this.findActionById(branch.destination_id);
			return { id: branch.id, text: `${ (sourceAction || { name: null}).name } > ${ (destAction || { name: null}).name }` }
		})
	}

	findActionById(id: string) : Action {
		return this.actions.find(action => action.id == id)
	}
}
