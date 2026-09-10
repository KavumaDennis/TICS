/**
 * Cloud Function: Send push notifications for assignment events
 *
 * Triggers:
 * - onCreate assignments: notify traveler of new pickup assignment
 * - onUpdate assignments: notify traveler of status changes
 *
 * Requirements:
 * - Firebase Cloud Messaging enabled
 * - Traveler device tokens stored in users/{uid}.devicePushTokens[]
 */

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface AssignmentData {
  tripId?: string;
  travelerId?: string;
  driverName?: string;
  vehicle?: string;
  plateNumber?: string;
  pickupLocation?: string;
  eta?: string;
  status?: string;
  destination?: string;
}

/**
 * Send FCM notification to traveler when pickup is assigned
 */
export const notifyAssignmentCreated = onDocumentCreated(
  'assignments/{assignmentId}',
  async (event) => {
    const assignment = event.data as AssignmentData | undefined;
    const { assignmentId } = event.params;

    if (!assignment?.travelerId || !assignment?.driverName) {
      console.log('Skipping notification: missing travelerId or driverName');
      return;
    }

    try {
      // Get traveler's FCM tokens
      const userDoc = await db.collection('users').doc(assignment.travelerId).get();
      const userData = userDoc.data() as Record<string, unknown> | undefined;
      const tokens: string[] = (userData?.devicePushTokens as string[]) || [];

      if (tokens.length === 0) {
        console.log(`No FCM tokens for traveler ${assignment.travelerId}`);
        return;
      }

      // Format ETA
      const eta = assignment.eta
        ? new Date(assignment.eta).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
        : 'TBD';

      // Build notification
      const notification: admin.messaging.Notification = {
        title: 'Pickup Confirmed',
        body: `Driver: ${assignment.driverName}\nVehicle: ${assignment.vehicle}\nETA: ${eta}`,
      };

      const dataPayload: Record<string, string> = {
        type: 'assignment_created',
        assignmentId,
        tripId: assignment.tripId || '',
        travelerId: assignment.travelerId,
        status: 'assigned',
        driverName: assignment.driverName,
        vehicle: assignment.vehicle || '',
        plateNumber: assignment.plateNumber || '',
        eta: assignment.eta || '',
      };

      // Send to all traveler devices
      const message: admin.messaging.MulticastMessage = {
        notification,
        data: dataPayload,
        tokens,
        android: {
          priority: 'high',
          notification: {
            channelId: 'assignments',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`Sent ${response.successCount} notifications for assignment ${assignmentId}`);

      // Clean up invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp: any, idx: number) => {
          if (!resp.success && resp.error?.code === 'messaging/invalid-registration-token') {
            invalidTokens.push(tokens[idx]);
          }
        });

        if (invalidTokens.length > 0) {
          await userDoc.ref.update({
            devicePushTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
          });
          console.log(`Removed ${invalidTokens.length} invalid tokens`);
        }
      }

      return null;
    } catch (error) {
      console.error('Error sending assignment notification:', error);
      return null;
    }
  }
);

/**
 * Send FCM notification when assignment status changes
 */
export const notifyAssignmentUpdated = onDocumentUpdated(
  'assignments/{assignmentId}',
  async (event) => {
    const before = event.data?.before as AssignmentData | undefined;
    const after = event.data?.after as AssignmentData | undefined;
    const { assignmentId } = event.params;

    if (!before || !after) return;

    // Only notify on status changes
    if (before.status === after.status) {
      return null;
    }

    if (!after?.travelerId) {
      return null;
    }

    try {
      // Get traveler's FCM tokens
      const userDoc = await db.collection('users').doc(after.travelerId).get();
      const userData = userDoc.data() as Record<string, unknown> | undefined;
      const tokens: string[] = (userData?.devicePushTokens as string[]) || [];

      if (tokens.length === 0) {
        return null;
      }

      // Status-specific messages for Last Mile ride tracking
      const statusMessages: Record<string, { title: string; body: string }> = {
        en_route: {
          title: 'Driver En Route',
          body: `${after.driverName} is on the way to pick you up.`,
        },
        arrived: {
          title: 'Driver Arrived',
          body: `${after.driverName} has arrived at ${after.pickupLocation || 'the pickup location'}.`,
        },
        picked_up: {
          title: 'Pickup Complete',
          body: `You've been picked up by ${after.driverName}. Enjoy your ride!`,
        },
        driver_arrived: {
          title: 'Driver Has Arrived',
          body: `${after.driverName} has arrived in a ${after.vehicle || 'vehicle'} (${after.plateNumber || 'N/A'}). Please proceed to pickup.`,
        },
        ride_started: {
          title: 'Ride Started',
          body: `Your ride to ${after.destination || 'your destination'} has started. Enjoy the journey!`,
        },
        near_destination: {
          title: 'Near Destination',
          body: `You are approaching ${after.destination || 'your destination'}. Please prepare to arrive.`,
        },
        completed: {
          title: 'Ride Completed',
          body: `You have arrived at ${after.destination || 'your destination'}. Thank you for riding with us!`,
        },
        cancelled: {
          title: 'Ride Cancelled',
          body: 'Your ride has been cancelled. Please contact your operator for assistance.',
        },
      };

      const message = statusMessages[after.status || ''];
      if (!message) {
        return null;
      }

      const notification: admin.messaging.Notification = {
        title: message.title,
        body: message.body,
      };

      const dataPayload: Record<string, string> = {
        type: 'assignment_updated',
        assignmentId,
        tripId: after.tripId || '',
        travelerId: after.travelerId,
        status: after.status || '',
        driverName: after.driverName || '',
        vehicle: after.vehicle || '',
        plateNumber: after.plateNumber || '',
        eta: after.eta || '',
      };

      const fcmMessage: admin.messaging.MulticastMessage = {
        notification,
        data: dataPayload,
        tokens,
        android: {
          priority: 'high',
          notification: {
            channelId: 'assignments',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(fcmMessage);
      console.log(`Sent ${response.successCount} status update notifications`);

      return null;
    } catch (error) {
      console.error('Error sending status update notification:', error);
      return null;
    }
  }
);