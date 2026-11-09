    <div class="comms-modal" id="commsRenameModal" hidden>
        <div class="comms-modal-backdrop" data-comms-rename-close></div>
        <div class="comms-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="commsRenameModalTitle">
            <header class="comms-modal-header">
                <h2 id="commsRenameModalTitle">Rename Group</h2>
                <button type="button" class="comms-icon-btn" data-comms-rename-close aria-label="Close">&times;</button>
            </header>
            <form class="comms-modal-body" id="commsRenameForm">
                <label class="comms-field-label" for="commsRenameInput">Group name</label>
                <input type="text" id="commsRenameInput" class="comms-field-input" maxlength="120" required autocomplete="off">
                <div class="comms-modal-actions">
                    <button type="button" class="comms-btn-secondary" data-comms-rename-close>Cancel</button>
                    <button type="submit" class="comms-btn-primary" id="commsRenameSubmit">Save</button>
                </div>
            </form>
        </div>
    </div>
