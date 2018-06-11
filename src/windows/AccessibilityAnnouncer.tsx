/**
* AccessibilityAnnouncer.tsx
*
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT license.
*
* Implements the behavior for announcing text via screen readers.
*/

import React = require('react');
import RN = require('react-native');
import { SubscriptionToken } from 'subscribableevent';
import Accessibility from './Accessibility';
import AccessibilityUtil from '../native-common/AccessibilityUtil';
import Styles from '../native-common/Styles';
import Types = require('../common/Types');

const _styles = {
    liveRegionContainer: Styles.createViewStyle({
        position: 'absolute',
        opacity: 0,
        top: -30,
        bottom: 0,
        left: 0,
        right: 0,
        height: 30
    })
};

export class AccessibilityAnnouncer extends React.Component<{}, {}> {
    private _viewElement: RN.Animated.View | null = null;
    private _announcementQueue: string[] = [];
    private _announcementQueueTimer: number | undefined;
    private _newAnnouncementEventChangedSubscription: SubscriptionToken | undefined;
    private _lastAnnouncement: string | undefined;

    constructor(props: {}) {
        super(props);

        // Update announcement text.
        this._newAnnouncementEventChangedSubscription =
            Accessibility.newAnnouncementReadyEvent.subscribe(announcement => {
                this._announcementQueue.push(announcement);
                this._tryDequeueAndAnnounce();
            });
    }

    componentWillUnmount() {
        if (this._newAnnouncementEventChangedSubscription) {
            this._newAnnouncementEventChangedSubscription.unsubscribe();
            this._newAnnouncementEventChangedSubscription = undefined;
        }
        if (this._announcementQueueTimer) {
            clearTimeout(this._announcementQueueTimer);
            this._announcementQueueTimer = undefined;
        }
    }

    render() {
        return (
            <RN.View
                ref={ this._onViewRef }
                style={ _styles.liveRegionContainer }
                accessibilityLiveRegion={ AccessibilityUtil.accessibilityLiveRegionToString(Types.AccessibilityLiveRegion.Polite) }
            />
        );
    }

    private _onViewRef = (view: RN.View|null): void => {
        this._viewElement = view;
        this._tryDequeueAndAnnounce();
    }

    private _tryDequeueAndAnnounce() {
        if (this._announcementQueueTimer === undefined) {
            this._dequeueAndPostAnnouncement();
        }
    }

    // Has to be arrow function to capture 'this' since it's passed as callback to setTimeout.
    private _dequeueAndPostAnnouncement = () => {
        if (this._viewElement && this._announcementQueue.length > 0) {
            const announcement = this._announcementQueue.shift();
            // This hack was copied from android/Accessibility.ts in order to not increase variety of hacks in codebase.
            //
            // Screen reader fails to announce, if the new announcement is the same as the last one.
            // The reason is probably that the announcement text is held in state and passed as a prop to RN.View.
            // If the announcement is the same, the props don't change and RN doesn't see a reason to re-render
            // the view - retrigger the announcement. This behaviour is actually expected. We work around this by checking
            // the new announcement text and comparing it with the last one. If they are the same, append a space at the end.
            const textToAnnounce = (announcement === this._lastAnnouncement) ? announcement + ' ' : announcement;

            this._viewElement.setNativeProps({
                accessibilityLabel : textToAnnounce
            });
            this._lastAnnouncement = textToAnnounce;

            // 2 seconds is probably enough for screen reader to finally receive UIA live region event
            // and go query the accessible name of the region to put into its own queue, so that we can
            // set name of the region to next announcement and fire the UIA live region event again.
            // The magic number is copied from web/AccessibilityAnnouncer clear timer.
            this._announcementQueueTimer = setTimeout(this._dequeueAndPostAnnouncement, 2000);
        } else {
            if (this._viewElement) {
                // We want to hide the view used for announcement from screen reader so user cannot navigate to it.
                // We do it by emptying accessible name on it as soon as possible - after we think screen reader
                // already processed live region event.
                this._viewElement.setNativeProps({
                    accessibilityLabel : ''
                });
            }
            this._lastAnnouncement = undefined;
            this._announcementQueueTimer = undefined;
        }
    }
}

export default AccessibilityAnnouncer;
