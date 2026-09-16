import { test, expect } from '@playwright/test'

test('cloud registration requests email and explains verification', async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        name: 'MS Digital Library',
        plans: [],
        demo: false,
        requiresEmail: true,
      },
    }),
  )
  await page.route('**/api/signup', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      name: 'Cloud Student',
      userId: 'cloudstudent',
      email: 'cloud@example.test',
      password: 'cloud-student-password',
    })
    await route.fulfill({ status: 201, json: { userId: 'cloudstudent', confirmEmail: true } })
  })
  await page.goto('/#access_token=example-auth-token&type=signup')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Open demo workspace' })).toHaveCount(0)
  await page.getByRole('button', { name: 'New user? Create an account' }).click()
  await page.getByLabel('Email address').fill('cloud@example.test')
  await page.getByLabel('Full name', { exact: true }).fill('Cloud Student')
  await page.getByLabel('User ID', { exact: true }).fill('cloudstudent')
  await page.getByLabel('Password', { exact: true }).fill('cloud-student-password')
  await page.getByLabel('Confirm password').fill('cloud-student-password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('email')
  await expect(page.getByLabel('User ID or email')).toHaveValue('cloudstudent')
})
