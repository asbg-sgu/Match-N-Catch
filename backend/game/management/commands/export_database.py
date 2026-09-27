"""Export Match N Catch application tables to a private S3 archive."""

import csv
import json
import os
import tempfile
import zipfile
from datetime import date, datetime, time, timezone
from pathlib import Path

import boto3
from django.core.management.base import BaseCommand, CommandError

from game.models import Event, GameAttempt, Player, RewardClaim


EXPORT_TABLES = (
    ('events', Event),
    ('players', Player),
    ('game_attempts', GameAttempt),
    ('reward_claims', RewardClaim),
)


def csv_value(value):
    """Return an Excel-friendly, unambiguous representation for a CSV field."""
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return value


class Command(BaseCommand):
    help = 'Export application data as CSV files in a ZIP archive uploaded to private S3.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--key',
            required=True,
            help='S3 object key. It must be under database-exports/ and end with .zip.',
        )

    def handle(self, *args, **options):
        bucket = os.environ.get('DATABASE_EXPORT_BUCKET')
        key = options['key']
        if not bucket:
            raise CommandError('DATABASE_EXPORT_BUCKET is not configured for this task.')
        if not key.startswith('database-exports/') or not key.endswith('.zip'):
            raise CommandError('The export key must start with database-exports/ and end with .zip.')

        export_started_at = datetime.now(timezone.utc)
        row_counts = {}
        with tempfile.TemporaryDirectory(prefix='match-n-catch-export-') as temporary_directory:
            archive_path = Path(temporary_directory) / 'match-n-catch-database.zip'
            with zipfile.ZipFile(archive_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for filename, model in EXPORT_TABLES:
                    columns = [field.attname for field in model._meta.concrete_fields]
                    csv_path = Path(temporary_directory) / f'{filename}.csv'
                    row_count = 0
                    # utf-8-sig lets Excel recognize Vietnamese and other UTF-8 text reliably.
                    with csv_path.open('w', encoding='utf-8-sig', newline='') as csv_file:
                        writer = csv.DictWriter(csv_file, fieldnames=columns, extrasaction='raise')
                        writer.writeheader()
                        rows = model.objects.order_by('pk').values(*columns).iterator(chunk_size=1_000)
                        for row in rows:
                            writer.writerow({column: csv_value(row[column]) for column in columns})
                            row_count += 1
                    archive.write(csv_path, arcname=csv_path.name)
                    row_counts[filename] = row_count

                manifest = {
                    'exported_at_utc': export_started_at.isoformat(),
                    'tables': row_counts,
                }
                archive.writestr('manifest.json', json.dumps(manifest, indent=2, sort_keys=True))

            boto3.client('s3').upload_file(
                str(archive_path),
                bucket,
                key,
                ExtraArgs={
                    'ContentType': 'application/zip',
                    'ServerSideEncryption': 'AES256',
                },
            )

        summary = ', '.join(f'{table}={count}' for table, count in row_counts.items())
        self.stdout.write(self.style.SUCCESS(f'Export uploaded to s3://{bucket}/{key} ({summary})'))
