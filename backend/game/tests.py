# Tests for Match & Catch Game
import shutil
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .models import Event, GameAttempt, Player, RewardClaim
from .services import get_or_create_default_event


class PlayerTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.event = get_or_create_default_event()

    def test_register_player(self):
        """Test registering a new player"""
        data = {
            'student_id': 'SV001',
            'display_name': 'Nguyen Van A'
        }
        response = self.client.post('/api/players/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['student_id'], 'SV001')
        self.assertTrue(response.data['can_play'])
        self.assertEqual(response.data['attempts_count'], 0)


class GameFlowTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.event = get_or_create_default_event()
        self.player_data = {
            'student_id': 'SV002',
            'display_name': 'Tran Thi B'
        }

    def test_start_game(self):
        """Test starting a new game"""
        response = self.client.post('/api/game/start/', self.player_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('session_token', response.data)
        self.assertIn('attempt_id', response.data)
        self.assertEqual(len(response.data['round_1_cards']), 20)
        self.assertEqual(len(response.data['round_2_cards']), 20)
        self.assertEqual(len(response.data['bonus_questions']), 2)

    def test_max_attempts_limit(self):
        """Test that player cannot play more than 3 times"""
        # Play 3 times
        for i in range(3):
            response = self.client.post('/api/game/start/', self.player_data, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 4th attempt should fail
        response = self.client.post('/api/game/start/', self.player_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class LeaderboardTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.event = get_or_create_default_event()

    def test_get_leaderboard(self):
        """Test fetching leaderboard"""
        response = self.client.get('/api/leaderboard/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('event_name', response.data)
        self.assertIn('top_entries', response.data)


class DatabaseExportCommandTestCase(TestCase):
    def test_export_database_uploads_all_application_tables(self):
        event = get_or_create_default_event()
        player = Player.objects.create(event=event, student_id='SV003', display_name='Le Thi C')
        attempt = GameAttempt.objects.create(
            event=event,
            player=player,
            session_token='export-command-test-session-token',
        )
        RewardClaim.objects.create(
            event=event,
            player=player,
            qualifying_attempt=attempt,
            reward_type='threshold',
        )

        with tempfile.TemporaryDirectory() as temporary_directory:
            saved_archive = Path(temporary_directory) / 'export.zip'

            def save_uploaded_archive(source, bucket, key, **kwargs):
                self.assertEqual(bucket, 'test-private-exports')
                self.assertEqual(key, 'database-exports/test.zip')
                shutil.copyfile(source, saved_archive)

            with patch.dict('os.environ', {'DATABASE_EXPORT_BUCKET': 'test-private-exports'}):
                with patch('game.management.commands.export_database.boto3.client') as client:
                    client.return_value.upload_file.side_effect = save_uploaded_archive
                    call_command('export_database', '--key', 'database-exports/test.zip')

            with zipfile.ZipFile(saved_archive) as archive:
                self.assertCountEqual(
                    archive.namelist(),
                    ['events.csv', 'players.csv', 'game_attempts.csv', 'reward_claims.csv', 'manifest.json'],
                )
                players_csv = archive.read('players.csv').decode('utf-8-sig')
                self.assertIn('SV003', players_csv)
