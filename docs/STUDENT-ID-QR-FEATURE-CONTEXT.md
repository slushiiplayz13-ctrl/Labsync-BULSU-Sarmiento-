# Student ID QR Feature Context

> **Note for Documentation Specialist:** This document provides a simple overview and project context for the latest feature added to the Computer Laboratory Monitoring workflow. Use this context when updating the capstone manuscript, system workflows, and user documentation.

---

## Latest Feature Added: Student ID QR for PC Issue Reporting

### Background & Problem

Previously, when students encountered hardware or software issues in the computer laboratories, they scanned the QR code attached to the specific laboratory PC. That QR code directed them straight to the computer laboratory report form.

On that form, students had to manually type in their full name and student number before submitting a report. During project review, our professor identified this as an **accountability issue**, as students could potentially type in fake names or incorrect identities when submitting reports.

---

### Solution & Overview

To resolve this accountability problem, we introduced a **Student ID QR scanning step** into the PC issue reporting workflow.

Instead of typing their identity manually, students scan the QR code located on the back of their physical BulSU Student ID. The system reads the ID's QR code and automatically populates their verified details.

---

### The New Workflow

The reporting process is now organized into a clear two-step flow:

```text
Scan PC QR → Scan Student ID QR → Student information is detected → Proceed to PC Report Form → Enter Section → Submit Report
```

1. **Step 1 — Verify Student ID (`student-id-verification.html`)**:
   - The student scans the QR code attached to the laboratory workstation, which identifies the laboratory room and specific PC.
   - The student arrives at a dedicated verification page where they scan the QR code on their Student ID using their device's camera (or upload an ID photo if camera access is unavailable).
   - The system detects and confirms the student's identity.

2. **Step 2 — Submit PC Report (`submit-pc-report.html`)**:
   - The student automatically transitions to the PC issue report form.
   - Their **Student Name** and **Student Number** are already filled in and marked as verified.
   - The student only enters their **Section** (e.g., BSIT 3A) and selects the affected equipment components or enters remarks describing the issue before submitting.

---

### Roles of the Two QR Codes

* **PC QR Code (on the laboratory desk/computer)**: Identifies the exact workstation (Room Number and PC Unit).
* **Student ID QR Code (on the student's physical ID)**: Identifies the reporting student:
  * **Name**
  * **Student Number**

---

### Key Benefits for the Capstone Project

* **Accountability**: Reports are directly tied to verified student IDs, preventing anonymous, fake, or falsified issue submissions.
* **Ease of Use & Faster Reporting**: Students no longer need to manually type their full name and student number on mobile devices.
* **Clear Two-Step Progression**: Separating ID verification into its own focused initial step keeps the reporting experience simple, structured, and intuitive.
